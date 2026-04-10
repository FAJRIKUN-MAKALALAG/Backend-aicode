const express = require('express');
const router = express.Router();

// HTML Dashboard Template
const renderDashboard = (logs) => `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Backend Status Dashboard</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
        .container { max-width: 1000px; margin: 0 auto; }
        h1 { color: #38bdf8; border-bottom: 2px solid #1e293b; padding-bottom: 10px; }
        .stats { display: flex; gap: 20px; margin-bottom: 20px; }
        .stat-card { background: #1e293b; padding: 20px; border-radius: 8px; flex: 1; text-align: center; border: 1px solid #334155; }
        .stat-card h3 { margin: 0; font-size: 14px; color: #94a3b8; }
        .stat-card p { margin: 10px 0 0 0; font-size: 24px; font-weight: bold; color: #f8fafc; }
        table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #334155; }
        th { background-color: #0f172a; color: #cbd5e1; font-weight: 600; text-transform: uppercase; font-size: 12px; }
        tr:last-child td { border-bottom: none; }
        tr:hover { background-color: #334155; }
        .method { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .m-GET { background-color: #0c4a6e; color: #38bdf8; }
        .m-POST { background-color: #14532d; color: #4ade80; }
        .m-PUT { background-color: #701a75; color: #e879f9; }
        .m-DELETE { background-color: #7f1d1d; color: #f87171; }
        .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
        .s-200, .s-201, .s-204 { background-color: #14532d; color: #4ade80; }
        .s-400, .s-401, .s-403, .s-404 { background-color: #7c2d12; color: #fb923c; }
        .s-500 { background-color: #7f1d1d; color: #f87171; }
        .auto-refresh {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .refresh-btn {
            background-color: #38bdf8; color: #0f172a; border: none; padding: 8px 16px; border-radius: 4px; font-weight: bold; cursor: pointer;
        }
        .refresh-btn:hover { background-color: #0ea5e9; }
    </style>
    <script>
        // Auto refresh every 10 seconds
        setTimeout(() => { window.location.reload(); }, 10000);
    </script>
</head>
<body>
    <div class="container">
        <div class="auto-refresh">
            <h1>🚀 API Backend Dashboard</h1>
            <button class="refresh-btn" onclick="window.location.reload()">Refresh Now</button>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <h3>Total Requests (in memory)</h3>
                <p>${logs.length}</p>
            </div>
            <div class="stat-card">
                <h3>Errors (4xx / 5xx)</h3>
                <p style="color: #f87171;">${logs.filter(l => l.status >= 400).length}</p>
            </div>
            <div class="stat-card">
                <h3>Uptime</h3>
                <p>${Math.floor(process.uptime() / 60)} mins</p>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Time</th>
                    <th>Method</th>
                    <th>Path</th>
                    <th>Status</th>
                    <th>Duration</th>
                </tr>
            </thead>
            <tbody>
                ${logs.map(log => `
                    <tr>
                        <td style="color: #94a3b8; font-size: 13px;">${new Date(log.time).toLocaleTimeString()}</td>
                        <td><span class="method m-${log.method}">${log.method}</span></td>
                        <td style="font-family: monospace;">${log.path}</td>
                        <td><span class="status s-${log.status >= 500 ? '500' : (log.status >= 400 ? '400' : '200')}">${log.status}</span></td>
                        <td style="color: #94a3b8;">${log.duration}</td>
                    </tr>
                `).join('')}
                ${logs.length === 0 ? '<tr><td colspan="5" style="text-align: center; color: #64748b;">Belum ada request yang tercatat. Coba buka endpoint API lainnya.</td></tr>' : ''}
            </tbody>
        </table>
    </div>
</body>
</html>
`;

// Protect dashboard route with query param password
// Example: /api/dashboard?key=admin123
router.get('/', (req, res) => {
    // SECURITY: Pakai kunci sederhana untuk mencegah orang luar membuka
    const secretKey = 'sukses2024'; // Ganti dengan password pilihan Anda
    if (req.query.key !== secretKey) {
        return res.status(401).send("Unauthorized. Tambahkan ?key=password di akhir URL.");
    }

    const logs = global.recentApiLogs || [];
    res.send(renderDashboard(logs));
});

module.exports = router;
