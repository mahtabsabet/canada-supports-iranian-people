/**
 * Vercel Serverless Function: MP Lookup Proxy
 *
 * Proxies requests to the OpenNorth Represent API to avoid CORS issues
 * and keep the third-party API call server-side.
 *
 * Usage: GET /api/represent?postcode=A1A1A1
 */

// Canadian postal code regex (no spaces, uppercase)
const POSTAL_CODE_REGEX = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;

// OpenNorth Represent API base URL
const REPRESENT_API_BASE = 'https://represent.opennorth.ca';

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10; // max 10 requests per minute per IP

// In-memory rate limit store (resets when function cold starts)
// Note: In serverless, this provides partial protection as instances may vary
const rateLimitStore = new Map();

/**
 * Clean up old rate limit entries
 */
function cleanupRateLimitStore() {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
        if (now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
            rateLimitStore.delete(key);
        }
    }
}

/**
 * Check rate limit for an IP
 * Returns { allowed: boolean, remaining: number, resetIn: number }
 */
function checkRateLimit(ip) {
    const now = Date.now();

    // Clean up periodically
    if (rateLimitStore.size > 1000) {
        cleanupRateLimitStore();
    }

    let data = rateLimitStore.get(ip);

    // New window or expired window
    if (!data || now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
        data = { windowStart: now, count: 0 };
    }

    data.count++;
    rateLimitStore.set(ip, data);

    const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - data.count);
    const resetIn = Math.ceil((data.windowStart + RATE_LIMIT_WINDOW_MS - now) / 1000);

    return {
        allowed: data.count <= RATE_LIMIT_MAX_REQUESTS,
        remaining,
        resetIn
    };
}

/**
 * Get client IP from request
 */
function getClientIp(req) {
    // Vercel provides the real IP in x-forwarded-for
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

/**
 * Validate and normalize postal code
 */
function normalizePostalCode(code) {
    if (!code || typeof code !== 'string') {
        return null;
    }
    // Remove spaces and uppercase
    const normalized = code.replace(/\s+/g, '').toUpperCase();

    // Validate format
    if (!POSTAL_CODE_REGEX.test(normalized)) {
        return null;
    }

    return normalized;
}

/**
 * Main handler for Vercel serverless function
 */
export default async function handler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get client IP and check rate limit
    const clientIp = getClientIp(req);
    const rateLimit = checkRateLimit(clientIp);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
    res.setHeader('X-RateLimit-Reset', rateLimit.resetIn);

    if (!rateLimit.allowed) {
        return res.status(429).json({
            error: `Too many requests. Please try again in ${rateLimit.resetIn} seconds.`
        });
    }

    // Get postal code from query
    const { postcode } = req.query;

    // Validate postal code
    const normalizedPostcode = normalizePostalCode(postcode);
    if (!normalizedPostcode) {
        return res.status(400).json({
            error: 'Invalid postal code format. Please provide a valid Canadian postal code (e.g., A1A1A1).'
        });
    }

    try {
        // Call OpenNorth Represent API
        const apiUrl = `${REPRESENT_API_BASE}/postcodes/${normalizedPostcode}/`;

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Canada-Supports-Iran/1.0'
            }
        });

        // Handle API errors
        if (!response.ok) {
            if (response.status === 404) {
                return res.status(404).json({
                    error: 'No results found for this postal code. Please verify the postal code is correct.'
                });
            }

            if (response.status === 400) {
                return res.status(400).json({
                    error: 'Invalid postal code format.'
                });
            }

            // Log unexpected errors server-side
            console.error(`OpenNorth API error: ${response.status} ${response.statusText}`);

            return res.status(502).json({
                error: 'Unable to reach the MP lookup service. Please try again later.'
            });
        }

        // Parse and return the response
        const data = await response.json();

        // Set cache headers (cache for 1 hour, stale-while-revalidate for 24 hours)
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

        return res.status(200).json(data);

    } catch (error) {
        console.error('Error calling OpenNorth API:', error);

        // Handle network errors
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            return res.status(503).json({
                error: 'Unable to connect to the MP lookup service. Please try again later.'
            });
        }

        return res.status(500).json({
            error: 'An unexpected error occurred. Please try again later.'
        });
    }
}
