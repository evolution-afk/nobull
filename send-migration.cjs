const fs = require('fs');
const https = require('https');

const token = process.env.ADMIN_TOKEN;
const targetUrl = 'https://nobull.pages.dev/api/admin/migrate-vpn';

async function run() {
    try {
        const fileContent = fs.readFileSync('migrate.json', 'utf8');
        console.log("Sending request...");
        
        // این بخش به Node.js می‌گوید که فیلترشکن را نادیده بگیرد
        const agent = new https.Agent({ 
            rejectUnauthorized: false,
            secureProtocol: 'TLSv1_2_method'
        });

        const req = https.request(targetUrl, {
            method: 'POST',
            agent: agent,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`Status: ${res.statusCode}`);
                console.log(`Response: ${data}`);
            });
        });

        req.on('error', (err) => {
            console.error('Connection error details:', err.message);
        });

        req.write(fileContent);
        req.end();
    } catch (err) {
        console.error('Read file error:', err.message);
    }
}
run();