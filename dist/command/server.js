import express from 'express';
const app = express();
const port = 3000;
// Basic route to handle the callback URL
app.get('/oauth2callback', (req, res) => {
    // Example: Capture a query parameter 'code' from the callback
    const { code } = req.query;
    if (code) {
        res.send(`Received callback with code: ${code}`);
    }
    else {
        res.send('No code received');
    }
});
// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
