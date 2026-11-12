param([string]$BasePython)
$ErrorActionPreference = 'Stop'
$workerHome = Join-Path $env:LOCALAPPDATA 'AI Video Edeting Machine\demo-worker'
New-Item -ItemType Directory -Path $workerHome -Force | Out-Null
$workerPython = Join-Path $workerHome 'venv\Scripts\python.exe'
if (!(Test-Path -LiteralPath $workerPython)) { if (!$BasePython) { $BasePython = Get-ChildItem (Join-Path $env:APPDATA 'uv\python\cpython-3.12*-windows-x86_64-none\python.exe') -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName }; if (!$BasePython) { $BasePython = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe' }; & $BasePython -m venv (Join-Path $workerHome 'venv'); if ($LASTEXITCODE) { throw 'Python 3.12 is required.' } }
& $workerPython -m pip install --upgrade pip
& $workerPython -m pip install torch==2.7.1 torchvision==0.22.1 --index-url https://download.pytorch.org/whl/cu128
if ($LASTEXITCODE) { throw 'CUDA PyTorch installation failed.' }
& $workerPython -m pip install opencv-python-headless==4.12.0.88 'numpy<2.3' pillow hydra-core iopath tqdm setuptools wheel
if ($LASTEXITCODE) { throw 'Video dependencies failed.' }
$env:SAM2_BUILD_CUDA = '0'
& node (Join-Path $PSScriptRoot 'fetch-demo-sam.mjs') (Join-Path $workerHome 'sam-source')
if ($LASTEXITCODE) { throw 'SAM source verification failed.' }
& $workerPython -m pip install --no-build-isolation (Join-Path $workerHome 'sam-source')
if ($LASTEXITCODE) { throw 'SAM 2 installation failed.' }
if (!(Test-Path -LiteralPath (Join-Path $workerHome 'sam2.1_hiera_small.pt'))) {
 Invoke-WebRequest 'https://huggingface.co/facebook/sam2.1-hiera-small/resolve/ee5bba1d82bb8749febdf90f45e84b687142ba03/sam2.1_hiera_small.pt' -OutFile (Join-Path $workerHome 'sam2.1_hiera_small.pt.partial')
 Move-Item -LiteralPath (Join-Path $workerHome 'sam2.1_hiera_small.pt.partial') -Destination (Join-Path $workerHome 'sam2.1_hiera_small.pt')
}
& $workerPython -c "import torch, cv2, sam2; print('CUDA ready:', torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'GPU unavailable')"


if ($LASTEXITCODE) { throw 'Demo worker import verification failed.' }
@{ installedAt = (Get-Date).ToUniversalTime().ToString('o'); model = 'sam2.1-small' } | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $workerHome 'ready.json')
