const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Custom basic .env file parser (zero-dependency)
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        let value = parts.slice(1).join('=').trim();
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    });
  }
} catch (e) {
  console.error('Failed to load local .env file:', e.message);
}

// Read API Key from environment variable
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// MIME Types for static file serving
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Logger
  console.log(`${req.method} ${req.url}`);

  // CORS Headers for safety/local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Route: POST /api/analyze
  if (req.method === 'POST' && req.url === '/api/analyze') {
    if (!GEMINI_API_KEY) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'GEMINI_API_KEY environment variable is not set on the server.' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      let parsedBody;
      try {
        parsedBody = JSON.parse(body);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body.' }));
        return;
      }

      const diaryText = parsedBody.text;
      if (!diaryText) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Diary text is required.' }));
        return;
      }

      // Call Gemini API using Node https.request
      // Gemini API 2.5 Flash endpoint (Latest Flash model)
      const apiHost = 'generativelanguage.googleapis.com';
      const apiPath = '/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_API_KEY;

      const requestPayload = JSON.stringify({
        contents: [{
          parts: [{
            text: "너는 심리 상담가야. 사용자가 작성한 일기 내용을 읽고, 사용자의 감정을 한 단어 (예:기쁨, 슬픔, 분노, 불안, 평온)로 요약해줘. 그리고 그 감정에 공감해주고, 따뜻한 응원의 메시지를 2~3문장으로 작성해줘. 답변 형식은 반드시 '감정:[요약된 감정]\\r\\n[응원 메시지]' 와 같이 줄 바꿈을 포함해서 보내줘. 일기 내용:\n\n" + diaryText
          }]
        }]
      });

      const options = {
        hostname: apiHost,
        path: apiPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestPayload)
        }
      };

      const apiReq = https.request(options, (apiRes) => {
        let apiData = '';
        apiRes.on('data', (chunk) => {
          apiData += chunk;
        });

        apiRes.on('end', () => {
          if (apiRes.statusCode !== 200) {
            console.error('Gemini API Error Status:', apiRes.statusCode, apiData);
            res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Error communicating with Gemini API.', details: apiData }));
            return;
          }

          try {
            const apiResult = JSON.parse(apiData);
            // Extract the generated text safely from Gemini response JSON structure
            let generatedText = '';
            if (apiResult.candidates && 
                apiResult.candidates[0] && 
                apiResult.candidates[0].content && 
                apiResult.candidates[0].content.parts && 
                apiResult.candidates[0].content.parts[0]) {
              generatedText = apiResult.candidates[0].content.parts[0].text;
            } else {
              generatedText = 'AI의 분석 결과를 추출할 수 없습니다.';
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ response: generatedText }));
          } catch (err) {
            console.error('Error parsing Gemini API response:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to parse Gemini response.' }));
          }
        });
      });

      apiReq.on('error', (err) => {
        console.error('Gemini Request Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to connect to Gemini API.' }));
      });

      apiReq.write(requestPayload);
      apiReq.end();
    });
    return;
  }

  // Serve Static Files
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  
  // Protect directory traversal
  if (filePath.indexOf(__dirname) !== 0) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>');
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + err.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log('Server is running at http://localhost:' + PORT);
  if (!GEMINI_API_KEY) {
    console.warn('WARNING: GEMINI_API_KEY environment variable is not set. Please set it before sending analysis requests.');
  } else {
    console.log('GEMINI_API_KEY environment variable is loaded.');
  }
});
