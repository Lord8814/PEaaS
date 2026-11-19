# Construit les VM de site du banc PEaaS sur Hyper-V (pc-fixe).
#
# Machine conforme au contrat D-019, rien de plus : Debian 13 (image cloud
# officielle), Docker + compose, NTP, utilisateur `lord` (clés du générateur et
# du pc-fixe). Aucun package PEaaS n'est posé ici : c'est le travail du
# générateur et de install.sh (filet, mode complet).
#
# Réseau (D-031 amendé, transposé à Hyper-V) :
#   eth0  Default Switch  : administration seulement (SSH depuis le générateur,
#                           registres Docker), DHCP, nom <site>.mshome.net
#   eth1  MultiSite privé : seule interface de la topologie, adresse statique
#                           host_address ; aucune passerelle, rien vers l'hôte.
#
# Rejouable : une VM déjà présente n'est pas touchée.
#   .\construire-sites.ps1 [-Sites site-a,site-b] [-MemoireGo 10] [-Cpu 4] [-DisqueGo 60]

param(
  [string[]]$Sites = @("site-a", "site-b", "site-p"),
  [int]$MemoireGo = 10,
  [int]$Cpu = 4,
  [int]$DisqueGo = 60
)
$ErrorActionPreference = "Stop"
$Racine = "F:\VMs\PEaaS-sites"
$Image = Join-Path $Racine "image\debian-13-generic-amd64.raw"
$Base = Join-Path $Racine "image\debian-13-base.vhd"

# Adresses de la topologie (PEaaSrepo/topology.yaml) : host_address de chaque site.
$Adresses = @{ "site-a" = "192.168.90.11"; "site-b" = "192.168.90.12"; "site-p" = "192.168.90.13" }
$Suffixes = @{ "site-a" = "A1"; "site-b" = "B1"; "site-p" = "C1" }

$Cles = @(
  (Get-Content (Join-Path $Racine "cles\generateur.pub") -Raw).Trim(),
  (Get-Content (Join-Path $Racine "cles\pc-fixe.pub") -Raw).Trim()
)

# ----------------------------------------------------------------------------
# Image brute -> VHD fixe (pied de page VHD ajouté, spécification Microsoft)
# ----------------------------------------------------------------------------
Add-Type -TypeDefinition @"
using System;
using System.IO;
public static class Vhd {
  static void BE(byte[] b, int o, ulong v, int n) { for (int i = n - 1; i >= 0; i--) { b[o + i] = (byte)(v & 0xFF); v >>= 8; } }
  public static void AjouterPied(string chemin) {
    long taille = new FileInfo(chemin).Length;
    if (taille % 512 != 0) throw new Exception("taille non multiple de 512");
    byte[] p = new byte[512];
    System.Text.Encoding.ASCII.GetBytes("conectix").CopyTo(p, 0);
    BE(p, 8, 2, 4);                       // features
    BE(p, 12, 0x00010000, 4);             // version
    BE(p, 16, 0xFFFFFFFFFFFFFFFF, 8);     // data offset (fixe)
    BE(p, 24, (ulong)(DateTime.UtcNow - new DateTime(2000,1,1,0,0,0,DateTimeKind.Utc)).TotalSeconds, 4);
    System.Text.Encoding.ASCII.GetBytes("win ").CopyTo(p, 28);
    BE(p, 32, 0x000A0000, 4);
    System.Text.Encoding.ASCII.GetBytes("Wi2k").CopyTo(p, 36);
    BE(p, 40, (ulong)taille, 8);          // taille d'origine
    BE(p, 48, (ulong)taille, 8);          // taille courante
    // Géométrie CHS (algorithme de la spécification VHD)
    long secteurs = Math.Min(taille / 512, 65535L * 16 * 255);
    long spt, tetes, cylXtetes;
    if (secteurs >= 65535L * 16 * 63) { spt = 255; tetes = 16; cylXtetes = secteurs / spt; }
    else {
      spt = 17; cylXtetes = secteurs / spt; tetes = (cylXtetes + 1023) / 1024;
      if (tetes < 4) tetes = 4;
      if (cylXtetes >= tetes * 1024 || tetes > 16) { spt = 31; tetes = 16; cylXtetes = secteurs / spt; }
      if (cylXtetes >= tetes * 1024) { spt = 63; tetes = 16; cylXtetes = secteurs / spt; }
    }
    long cyl = cylXtetes / tetes;
    BE(p, 56, (ulong)cyl, 2); p[58] = (byte)tetes; p[59] = (byte)spt;
    BE(p, 60, 2, 4);                      // type : fixe
    Guid.NewGuid().ToByteArray().CopyTo(p, 68);
    uint somme = 0; foreach (byte x in p) somme += x;
    BE(p, 64, ~somme, 4);
    using (var f = new FileStream(chemin, FileMode.Append)) f.Write(p, 0, 512);
  }
}
"@

if (-not (Test-Path $Base)) {
  Write-Host "== Image de base : $Base"
  Copy-Item $Image "$Base.tmp"
  [Vhd]::AjouterPied("$Base.tmp")
  Rename-Item "$Base.tmp" (Split-Path $Base -Leaf)
}

# ----------------------------------------------------------------------------
# Disque de configuration cloud-init (NoCloud, ISO 9660 étiqueté « cidata »)
# ----------------------------------------------------------------------------
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public static class Flux {
  public static void VersFichier(object flux, string chemin) {
    IStream s = (IStream)flux;
    using (var f = File.Create(chemin)) {
      byte[] tampon = new byte[65536];
      IntPtr lus = Marshal.AllocHGlobal(4);
      try {
        while (true) {
          s.Read(tampon, tampon.Length, lus);
          int n = Marshal.ReadInt32(lus);
          if (n <= 0) break;
          f.Write(tampon, 0, n);
        }
      } finally { Marshal.FreeHGlobal(lus); }
    }
  }
}
"@

function Nouvel-IsoSeed([string]$Dossier, [string]$Iso) {
  $fs = New-Object -ComObject IMAPI2FS.MsftFileSystemImage
  $fs.FileSystemsToCreate = 3   # ISO 9660 + Joliet
  $fs.VolumeName = "cidata"
  $fs.Root.AddTree($Dossier, $false)
  $res = $fs.CreateResultImage()
  [Flux]::VersFichier($res.ImageStream, $Iso)
}

function Ecrire-Lf([string]$Chemin, [string]$Texte) {
  [IO.File]::WriteAllText($Chemin, ($Texte -replace "`r`n", "`n"), (New-Object Text.UTF8Encoding $false))
}

foreach ($site in $Sites) {
  $nomVm = "PEaaS-$site"
  if (Get-VM -Name $nomVm -ErrorAction SilentlyContinue) { Write-Host "== $nomVm existe déjà : inchangée"; continue }
  $dossierVm = Join-Path $Racine $site
  $seed = Join-Path $dossierVm "seed"
  New-Item -ItemType Directory -Force $seed | Out-Null

  $macAdmin = "00155D9000" + $Suffixes[$site]
  $macTopo  = "00155D9001" + $Suffixes[$site]
  $fmt = { param($m) ($m -split '(..)' | ? { $_ }) -join ':' }
  $clesYaml = ($Cles | ForEach-Object { "      - $_" }) -join "`n"

  Ecrire-Lf (Join-Path $seed "meta-data") @"
instance-id: peaas-$site-1
local-hostname: $site
"@

  Ecrire-Lf (Join-Path $seed "network-config") @"
version: 2
ethernets:
  admin:
    match:
      macaddress: "$((& $fmt $macAdmin).ToLower())"
    set-name: eth0
    dhcp4: true
  topologie:
    match:
      macaddress: "$((& $fmt $macTopo).ToLower())"
    set-name: eth1
    dhcp4: false
    addresses: [$($Adresses[$site])/24]
"@

  Ecrire-Lf (Join-Path $seed "user-data") @"
#cloud-config
hostname: $site
# 127.0.1.1 <site> seulement : aucune entrée vers un pair (règle d'isolation).
manage_etc_hosts: localhost
timezone: Europe/Paris
users:
  - name: lord
    groups: [sudo]
    shell: /bin/bash
    lock_passwd: true
    sudo: "ALL=(ALL) NOPASSWD:ALL"
    ssh_authorized_keys:
$clesYaml
ssh_pwauth: false
package_update: true
packages: [ca-certificates, curl, systemd-timesyncd, jq]
# SE6 (19/11/2026) : LLMNR coupé. systemd-resolved l'écoute sur 5355, toutes
# interfaces, y compris celle de la topologie ; aucun usage sur le banc
# (noms d'administration servis par le Default Switch, aucun nom de pair).
write_files:
  - path: /etc/systemd/resolved.conf.d/peaas-se6.conf
    content: |
      [Resolve]
      LLMNR=no
      MulticastDNS=no
runcmd:
  - [systemctl, restart, systemd-resolved]
  - [sh, -c, "curl -fsSL https://get.docker.com | sh"]
  - [usermod, -aG, docker, lord]
  - [timedatectl, set-ntp, "true"]
  - [systemctl, enable, --now, docker]
  - [sh, -c, "echo 'machine preparee (D-019) par cloud-init' > /etc/peaas-machine"]
"@

  $iso = Join-Path $dossierVm "seed-$site.iso"
  Nouvel-IsoSeed $seed $iso

  $vhdx = Join-Path $dossierVm "$site.vhdx"
  Write-Host "== $nomVm : disque $vhdx"
  Convert-VHD -Path $Base -DestinationPath $vhdx -VHDType Dynamic
  Resize-VHD -Path $vhdx -SizeBytes ([int64]$DisqueGo * 1GB)

  New-VM -Name $nomVm -Generation 2 -MemoryStartupBytes ([int64]$MemoireGo * 1GB) -VHDPath $vhdx -SwitchName "Default Switch" -Path $Racine | Out-Null
  Set-VMMemory -VMName $nomVm -DynamicMemoryEnabled $false
  Set-VMProcessor -VMName $nomVm -Count $Cpu
  Set-VMFirmware -VMName $nomVm -SecureBootTemplate MicrosoftUEFICertificateAuthority
  Get-VMNetworkAdapter -VMName $nomVm | Set-VMNetworkAdapter -StaticMacAddress $macAdmin
  Get-VMNetworkAdapter -VMName $nomVm | Rename-VMNetworkAdapter -NewName "admin"
  Add-VMNetworkAdapter -VMName $nomVm -Name "topologie" -SwitchName MultiSite -StaticMacAddress $macTopo
  Add-VMDvdDrive -VMName $nomVm -Path $iso
  Set-VMFirmware -VMName $nomVm -FirstBootDevice (Get-VMHardDiskDrive -VMName $nomVm)
  Set-VM -Name $nomVm -AutomaticStartAction Nothing -AutomaticStopAction ShutDown -Notes "PEaaS banc : $site ($($Adresses[$site]) sur MultiSite). Construit par construire-sites.ps1."
  Enable-VMIntegrationService -VMName $nomVm -Name "Interface de services d'invité", "Guest Service Interface" -ErrorAction SilentlyContinue
  Start-VM -Name $nomVm
  Write-Host "== $nomVm démarrée"
}
