# Support the People of Iran - MP Contact Tool

A simple website that helps Canadians email their Member of Parliament to support the people of Iran.

## Features

- **MP Lookup**: Automatically finds your federal MP based on postal code using the OpenNorth Represent API
- **Editable Email**: Customize the subject and message before sending
- **Multiple Send Options**: Open in default email client, Gmail, or copy to clipboard
- **Privacy-First**: No data is stored; email is generated entirely in your browser
- **Rate Limited**: Protection against API abuse
- **Mobile-Friendly**: Responsive design works on all devices

## How It Works

1. User enters their name, address, and postal code
2. The site looks up their federal MP via a serverless proxy
3. A pre-written email is generated (editable by user)
4. User can open the email in their email client, Gmail, or copy the text

## Project Structure

```
├── index.html          # Main HTML page
├── styles.css          # Mobile-first CSS
├── main.js             # Client-side JavaScript
├── api/
│   └── represent.js    # Vercel serverless function (API proxy)
├── vercel.json         # Vercel configuration
└── README.md           # This file
```

## Deployment

### Via GitHub (Recommended)

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click "New Project" and import your GitHub repository
4. Vercel will auto-detect and deploy

### Via CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel

# Production deployment
vercel --prod
```

## Local Development

```bash
# Install Vercel CLI
npm install -g vercel

# Login (first time only)
vercel login

# Run development server
vercel dev
```

Server runs at `http://localhost:3000`

## API Reference

### GET /api/represent

Looks up representatives for a Canadian postal code.

**Query Parameters:**
- `postcode` (required): Canadian postal code (spaces optional, case insensitive)

**Response:**
- `200 OK`: JSON with representatives data
- `400 Bad Request`: Invalid postal code format
- `404 Not Found`: No results for postal code
- `429 Too Many Requests`: Rate limit exceeded

**Rate Limits:**
- 10 requests per minute per IP

## Privacy

- No user data is stored on any server
- Postal code lookups are not logged
- Email is generated entirely in the browser
- No cookies or tracking

## Credits

- MP data provided by [OpenNorth Represent](https://represent.opennorth.ca/)
- Not affiliated with the Government of Canada

## License

MIT License - feel free to use and modify for similar advocacy purposes.
