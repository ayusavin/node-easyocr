const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function getPythonPath() {
  try {
    // Try to get Python path using 'which' command (for Unix-like systems)
    const pythonPath = execSync('which python3 || which python').toString().trim();
    if (!pythonPath) {
      throw new Error('Python not found');
    }
    return pythonPath;
  } catch (error) {
    // If 'which' fails or returns empty, try 'where' command (for Windows)
    try {
      const pythonPath = execSync('where python').toString().split('\n')[0].trim();
      if (!pythonPath) {
        throw new Error('Python not found');
      }
      return pythonPath;
    } catch (windowsError) {
      throw new Error('Python not found. Please install Python and add it to your PATH.');
    }
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { stdio: 'inherit', ...options });
    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with exit code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

function runCommandWithOutput(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, { stdio: 'pipe', ...options });
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
    
    process.on('error', (error) => {
      reject(error);
    });
  });
}

async function downloadEasyOCRModels(venvPythonPath) {
  try {
    console.log('\nDownloading EasyOCR models...');
    console.log('This may take a few minutes on first run...');
    
    // Create a Python script to download models
    const downloadScript = `
import easyocr
import sys

try:
    print("Initializing EasyOCR Reader with English language...")
    reader = easyocr.Reader(['en'], gpu=False)
    print("Models downloaded successfully!")
    print("EasyOCR is ready to use.")
except Exception as e:
    print(f"Error downloading models: {e}", file=sys.stderr)
    sys.exit(1)
`;

    const scriptPath = path.join(__dirname, 'download_models_temp.py');
    fs.writeFileSync(scriptPath, downloadScript);

    try {
      const result = await runCommandWithOutput(venvPythonPath, [scriptPath]);
      
      if (result.code !== 0) {
        console.error('Error downloading models:', result.stderr);
        throw new Error('Failed to download EasyOCR models');
      }
      
      console.log(result.stdout);
      console.log('EasyOCR models setup complete!');
    } finally {
      // Clean up temporary script
      try {
        fs.unlinkSync(scriptPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('Error downloading EasyOCR models:', error.message);
    console.warn('Models will be downloaded automatically on first use.');
  }
}

try {
  const pythonPath = getPythonPath();
  const venvPath = path.join(__dirname, 'venv');

  const requirements = [
    'easyocr',
    'torch',
    'torchvision'
  ];

  async function setup() {
    try {
      console.log('Setting up Python environment...');
      console.log(`Using Python at: ${pythonPath}`);
      
      // Create virtual environment
      console.log('Creating virtual environment...');
      await runCommand(pythonPath, ['-m', 'venv', venvPath]);
      
      // Determine the path to the virtual environment's Python executable
      const venvPythonPath = process.platform === 'win32'
        ? path.join(venvPath, 'Scripts', 'python.exe')
        : path.join(venvPath, 'bin', 'python');
      
      // Ensure pip is up to date in the virtual environment
      console.log('Upgrading pip...');
      await runCommand(venvPythonPath, ['-m', 'pip', 'install', '--upgrade', 'pip']);
      
      // Install requirements in the virtual environment
      for (const req of requirements) {
        console.log(`Installing ${req}...`);
        await runCommand(venvPythonPath, ['-m', 'pip', 'install', req]);
      }
      
      console.log('Python dependencies installation complete!');
      
      // Download EasyOCR models
      await downloadEasyOCRModels(venvPythonPath);
      
      console.log('\nPython environment setup complete!');
      console.log(`To activate the virtual environment, run:`);
      if (process.platform === 'win32') {
        console.log(`${path.join(venvPath, 'Scripts', 'activate.bat')}`);
      } else {
        console.log(`source ${path.join(venvPath, 'bin', 'activate')}`);
      }
    } catch (error) {
      console.error('Error setting up Python environment:', error);
      process.exit(1);
    }
  }

  setup();
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
