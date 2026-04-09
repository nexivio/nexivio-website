import { google } from 'googleapis';

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { fullName, email, organization } = req.body;

        // Validate required fields
        if (!fullName || !email) {
            return res.status(400).json({ error: 'Full name and email are required' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
        const GOOGLE_CREDENTIALS = process.env.GOOGLE_CREDENTIALS;
        const SHEET_NAME = 'Sheet1';

        // Check if credentials are configured
        if (!GOOGLE_SHEETS_ID || !GOOGLE_CREDENTIALS) {
            console.error('Missing Google Sheets configuration');
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Parse credentials
        let credentials;
        try {
            credentials = JSON.parse(GOOGLE_CREDENTIALS);
        } catch (parseError) {
            console.error('Failed to parse Google credentials:', parseError.message);
            return res.status(500).json({ error: 'Server configuration error' });
        }

        // Initialize Google Auth
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        const sheets = google.sheets({ version: 'v4', auth });

        // Check for duplicate email
        try {
            const getResponse = await sheets.spreadsheets.values.get({
                spreadsheetId: GOOGLE_SHEETS_ID,
                range: `${SHEET_NAME}!A2:E`
            });

            const rows = getResponse.data.values || [];
            const isDuplicate = rows.some(row => row[2] === email);

            if (isDuplicate) {
                return res.status(400).json({ error: 'This email is already subscribed' });
            }
        } catch (checkError) {
            console.error('Error checking for duplicates:', checkError.message);
            // Continue anyway, might be first entry
        }

        // Append new subscriber
        const timestamp = new Date().toISOString();
        
        try {
            await sheets.spreadsheets.values.append({
                spreadsheetId: GOOGLE_SHEETS_ID,
                range: `${SHEET_NAME}!A1`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [[
                        timestamp,
                        fullName,
                        email,
                        organization || 'N/A',
                        'website'
                    ]]
                }
            });

            console.log(`✅ New subscriber: ${email} (${fullName})`);

            return res.status(200).json({
                success: true,
                message: 'Successfully subscribed to newsletter',
                data: {
                    email,
                    fullName,
                    timestamp
                }
            });
        } catch (appendError) {
            console.error('Error appending to Google Sheets:', appendError.message);
            return res.status(500).json({ error: 'Failed to save subscription' });
        }

    } catch (error) {
        console.error('❌ Error processing subscription:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
