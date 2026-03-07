const http = require('http');

const options = {
  hostname: '172.19.0.2',
  port: 4040,
  path: '/health',
  method: 'GET',
  timeout: 5000,
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Response:', data);
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.on('timeout', () => {
  console.error('Timeout');
  req.destroy();
});

req.end();
