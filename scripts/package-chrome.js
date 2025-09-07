const path = require('path');
const { execSync } = require('child_process');

const buildDir = path.join('public');
const outputZip = 'ChatTweak-chrome.zip';

if (process.platform === 'win32') {
  execSync(`cd ${buildDir} && powershell.exe -command "Compress-Archive -Path '*' -DestinationPath '${path.join("..", "dist", outputZip)}'"`, { stdio: 'inherit' });
} else {
  execSync(`zip -r ${path.join("dist", outputZip)} ${buildDir}`, { stdio: 'inherit' });
}

console.log(`Created ${outputZip}`);