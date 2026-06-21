const { execSync } = require('child_process');

const port = process.env.PORT || 5000;

try {
  let pid;
  if (process.platform === 'win32') {
    // Windows: find the process ID using netstat and kill it
    const stdout = execSync('netstat -ano').toString();
    const lines = stdout.split('\n');
    for (const line of lines) {
      if (line.includes(`:${port}`) && line.includes('LISTENING')) {
        const parts = line.trim().split(/\s+/);
        pid = parts[parts.length - 1];
        if (pid && pid !== '0') {
          console.log(`[kill-port] Found process on port ${port} with PID ${pid}. Terminating...`);
          execSync(`taskkill /F /PID ${pid}`);
          console.log(`[kill-port] Successfully killed process ${pid}.`);
          break;
        }
      }
    }
  } else {
    // macOS / Linux: find the process ID using lsof and kill it
    try {
      pid = execSync(`lsof -t -i:${port}`).toString().trim();
      if (pid) {
        console.log(`[kill-port] Found process on port ${port} with PID ${pid}. Terminating...`);
        execSync(`kill -9 ${pid}`);
        console.log(`[kill-port] Successfully killed process ${pid}.`);
      }
    } catch (e) {
      // lsof returns status 1 if no match is found, which is fine
    }
  }
} catch (error) {
  // If no process is running, or if killing fails, log it and proceed
  console.log(`[kill-port] No active process was found or terminated on port ${port}.`);
}
