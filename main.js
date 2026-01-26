/**
 * Support the People of Iran - MP Contact Tool
 * Main JavaScript functionality
 */

(function () {
    'use strict';

    // ============================================
    // Constants
    // ============================================

    const CC_EMAILS = 'pm@pm.gc.ca,anita.anand@international.gc.ca';
    const DEFAULT_EMAIL_SUBJECT = 'Human Rights for the People of Iran';

    const POSTAL_CODE_REGEX = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;

    // Client-side rate limiting
    const RATE_LIMIT_COOLDOWN_MS = 3000; // 3 seconds between requests
    const RATE_LIMIT_MAX_PER_SESSION = 20; // Max lookups per session

    // ============================================
    // DOM Elements
    // ============================================

    const form = document.getElementById('mp-form');
    const findMpBtn = document.getElementById('findMpBtn');
    const errorSection = document.getElementById('error-section');
    const errorMessage = document.getElementById('error-message');
    const mpResult = document.getElementById('mp-result');
    const openEmailBtn = document.getElementById('openEmailBtn');
    const openGmailBtn = document.getElementById('openGmailBtn');
    const copyEmailBtn = document.getElementById('copyEmailBtn');
    const copyFeedback = document.getElementById('copyFeedback');

    // Form fields
    const fields = {
        firstName: document.getElementById('firstName'),
        lastName: document.getElementById('lastName'),
        email: document.getElementById('email'),
        streetAddress: document.getElementById('streetAddress'),
        city: document.getElementById('city'),
        province: document.getElementById('province'),
        postalCode: document.getElementById('postalCode')
    };

    // Display elements
    const display = {
        mpName: document.getElementById('mpName'),
        mpRiding: document.getElementById('mpRiding'),
        mpEmail: document.getElementById('mpEmail'),
        previewTo: document.getElementById('previewTo')
    };

    // Email editor fields
    const emailSubjectField = document.getElementById('emailSubject');
    const emailBodyField = document.getElementById('emailBody');

    // Current MP data
    let currentMp = null;
    let currentEmailBody = '';

    // Rate limiting state
    let lastRequestTime = 0;
    let requestCount = 0;

    // ============================================
    // Utility Functions
    // ============================================

    /**
     * Normalize postal code: remove spaces and uppercase
     */
    function normalizePostalCode(code) {
        return code.replace(/\s+/g, '').toUpperCase();
    }

    /**
     * Validate postal code format
     */
    function isValidPostalCode(code) {
        return POSTAL_CODE_REGEX.test(code);
    }

    /**
     * Validate email format
     */
    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Check client-side rate limit
     * Returns { allowed: boolean, message: string }
     */
    function checkClientRateLimit() {
        const now = Date.now();

        // Check session limit
        if (requestCount >= RATE_LIMIT_MAX_PER_SESSION) {
            return {
                allowed: false,
                message: 'You have reached the maximum number of lookups. Please refresh the page if you need to continue.'
            };
        }

        // Check cooldown
        const timeSinceLastRequest = now - lastRequestTime;
        if (lastRequestTime > 0 && timeSinceLastRequest < RATE_LIMIT_COOLDOWN_MS) {
            const waitTime = Math.ceil((RATE_LIMIT_COOLDOWN_MS - timeSinceLastRequest) / 1000);
            return {
                allowed: false,
                message: `Please wait ${waitTime} second${waitTime > 1 ? 's' : ''} before trying again.`
            };
        }

        return { allowed: true, message: '' };
    }

    /**
     * Record a request for rate limiting
     */
    function recordRequest() {
        lastRequestTime = Date.now();
        requestCount++;
    }

    /**
     * Derive MP email from name using standard pattern
     * Pattern: first.last@parl.gc.ca (lowercase, spaces removed)
     */
    function deriveEmailFromName(name) {
        // Split name into parts
        const parts = name.trim().split(/\s+/);
        if (parts.length < 2) {
            return null;
        }

        // First name is first part, last name is last part
        let firstName = parts[0].toLowerCase();
        let lastName = parts[parts.length - 1].toLowerCase();

        // Handle hyphens: keep them but lowercase
        // Remove accents and special characters except hyphens
        firstName = firstName
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z-]/g, '');

        lastName = lastName
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z-]/g, '');

        if (!firstName || !lastName) {
            return null;
        }

        return `${firstName}.${lastName}@parl.gc.ca`;
    }

    /**
     * Get last name from full name
     */
    function getLastName(fullName) {
        const parts = fullName.trim().split(/\s+/);
        return parts[parts.length - 1];
    }

    /**
     * Show error message
     */
    function showError(message) {
        errorMessage.textContent = message;
        errorSection.classList.remove('hidden');
        mpResult.classList.add('hidden');
        errorSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /**
     * Hide error message
     */
    function hideError() {
        errorSection.classList.add('hidden');
    }

    /**
     * Show field error
     */
    function showFieldError(field, message) {
        const errorEl = document.getElementById(`${field.id}-error`);
        if (errorEl) {
            errorEl.textContent = message;
        }
        field.classList.add('invalid');
    }

    /**
     * Clear field error
     */
    function clearFieldError(field) {
        const errorEl = document.getElementById(`${field.id}-error`);
        if (errorEl) {
            errorEl.textContent = '';
        }
        field.classList.remove('invalid');
    }

    /**
     * Clear all field errors
     */
    function clearAllFieldErrors() {
        Object.values(fields).forEach(field => {
            clearFieldError(field);
        });
    }

    /**
     * Set loading state on button
     */
    function setLoading(isLoading) {
        if (isLoading) {
            findMpBtn.classList.add('loading');
            findMpBtn.disabled = true;
        } else {
            findMpBtn.classList.remove('loading');
            findMpBtn.disabled = false;
        }
    }

    // ============================================
    // Form Validation
    // ============================================

    /**
     * Validate all form fields
     * Returns true if valid, false otherwise
     */
    function validateForm() {
        let isValid = true;
        clearAllFieldErrors();

        // First name
        if (!fields.firstName.value.trim()) {
            showFieldError(fields.firstName, 'First name is required');
            isValid = false;
        }

        // Last name
        if (!fields.lastName.value.trim()) {
            showFieldError(fields.lastName, 'Last name is required');
            isValid = false;
        }

        // Email
        if (!fields.email.value.trim()) {
            showFieldError(fields.email, 'Email is required');
            isValid = false;
        } else if (!isValidEmail(fields.email.value.trim())) {
            showFieldError(fields.email, 'Please enter a valid email address');
            isValid = false;
        }

        // Street address
        if (!fields.streetAddress.value.trim()) {
            showFieldError(fields.streetAddress, 'Street address is required');
            isValid = false;
        }

        // City
        if (!fields.city.value.trim()) {
            showFieldError(fields.city, 'City is required');
            isValid = false;
        }

        // Province
        if (!fields.province.value) {
            showFieldError(fields.province, 'Please select a province');
            isValid = false;
        }

        // Postal code
        const normalizedPostal = normalizePostalCode(fields.postalCode.value);
        if (!normalizedPostal) {
            showFieldError(fields.postalCode, 'Postal code is required');
            isValid = false;
        } else if (!isValidPostalCode(normalizedPostal)) {
            showFieldError(fields.postalCode, 'Please enter a valid postal code (e.g., A1A 1A1)');
            isValid = false;
        }

        return isValid;
    }

    // ============================================
    // API Functions
    // ============================================

    /**
     * Fetch MP data from proxy endpoint
     */
    async function fetchMpData(postalCode) {
        const response = await fetch(`/api/represent?postcode=${encodeURIComponent(postalCode)}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to fetch MP data (status ${response.status})`);
        }

        return response.json();
    }

    /**
     * Select the federal MP from response
     * Prefer House of Commons representative
     */
    function selectFederalMp(data) {
        if (!data || !data.representatives_centroid) {
            return null;
        }

        const reps = data.representatives_centroid;

        // Look for federal MP (House of Commons)
        const mp = reps.find(rep => {
            const office = (rep.elected_office || '').toLowerCase();
            const district = (rep.district_name || '').toLowerCase();
            const repSet = (rep.representative_set_name || '').toLowerCase();

            // Check for House of Commons indicators
            return (
                office.includes('mp') ||
                office.includes('member of parliament') ||
                repSet.includes('house of commons') ||
                repSet.includes('chambre des communes') ||
                (office === '' && repSet.includes('canada'))
            );
        });

        return mp || null;
    }

    // ============================================
    // Email Generation
    // ============================================

    /**
     * Generate default email body text
     */
    function generateEmailBody(mpName, userData) {
        return `Dear ${mpName},

I am writing as a constituent to encourage a clear, cross-partisan show of support for the people of Iran who continue to protest for basic rights and freedoms.

Amnesty International and UN human rights experts have documented lethal violence against largely peaceful protesters, mass arrests, and enforced disappearances. Independent reporting indicates thousands may have been killed or injured, with internet shutdowns and reports of security forces targeting hospitals further obscuring the scale of abuses.

These are serious human rights concerns, not partisan claims. A unified message from Canadian leaders would send a powerful signal of Canada's commitment to democratic values.

Thank you for your time and service.

Sincerely,
${userData.firstName} ${userData.lastName}
${userData.streetAddress}
${userData.city}, ${userData.province} ${userData.postalCode}`;
    }

    /**
     * Generate mailto link
     */
    function generateMailtoLink(toEmail, subject, body, cc) {
        const params = new URLSearchParams();
        params.set('subject', subject);
        params.set('body', body);
        if (cc) {
            params.set('cc', cc);
        }

        return `mailto:${encodeURIComponent(toEmail)}?${params.toString()}`;
    }

    /**
     * Generate full email text for copying
     */
    function generateFullEmailText(toEmail, subject, body, cc) {
        let text = `To: ${toEmail}\n`;
        if (cc) {
            text += `CC: ${cc}\n`;
        }
        text += `Subject: ${subject}\n\n`;
        text += body;
        return text;
    }

    /**
     * Generate Gmail compose URL
     */
    function generateGmailLink(toEmail, subject, body, cc) {
        const params = new URLSearchParams();
        params.set('view', 'cm');
        params.set('fs', '1');
        params.set('to', toEmail);
        if (cc) {
            params.set('cc', cc);
        }
        params.set('su', subject);
        params.set('body', body);

        return `https://mail.google.com/mail/?${params.toString()}`;
    }

    // ============================================
    // Display Functions
    // ============================================

    /**
     * Update email links based on current editor values
     */
    function updateEmailLinks() {
        if (!currentMp) return;

        const subject = emailSubjectField.value;
        const body = emailBodyField.value;

        // Update mailto link
        const mailtoLink = generateMailtoLink(
            currentMp.email,
            subject,
            body,
            CC_EMAILS
        );
        openEmailBtn.href = mailtoLink;

        // Update Gmail link
        const gmailLink = generateGmailLink(
            currentMp.email,
            subject,
            body,
            CC_EMAILS
        );
        openGmailBtn.href = gmailLink;
    }

    /**
     * Display MP result and email editor
     */
    function displayMpResult(mp, userData) {
        // Get MP email (from API or derive from name)
        let mpEmail = mp.email;
        if (!mpEmail && mp.name) {
            mpEmail = deriveEmailFromName(mp.name);
        }

        if (!mpEmail) {
            showError('Could not determine MP email address. Please contact your MP directly.');
            return;
        }

        currentMp = {
            name: mp.name,
            riding: mp.district_name || mp.riding || 'Unknown riding',
            email: mpEmail
        };

        // Generate default email body
        const defaultBody = generateEmailBody(currentMp.name, userData);

        // Update display
        display.mpName.textContent = currentMp.name;
        display.mpRiding.textContent = currentMp.riding;
        display.mpEmail.textContent = currentMp.email;
        display.previewTo.textContent = currentMp.email;

        // Populate editable fields
        emailSubjectField.value = DEFAULT_EMAIL_SUBJECT;
        emailBodyField.value = defaultBody;

        // Generate initial mailto link
        updateEmailLinks();

        // Show result section
        hideError();
        mpResult.classList.remove('hidden');
        mpResult.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ============================================
    // Event Handlers
    // ============================================

    /**
     * Handle form submission
     */
    async function handleFormSubmit(e) {
        e.preventDefault();

        // Check client-side rate limit first
        const rateLimitCheck = checkClientRateLimit();
        if (!rateLimitCheck.allowed) {
            showError(rateLimitCheck.message);
            return;
        }

        // Validate form
        if (!validateForm()) {
            // Focus first invalid field
            const firstInvalid = form.querySelector('.invalid');
            if (firstInvalid) {
                firstInvalid.focus();
            }
            return;
        }

        // Get form data
        const normalizedPostal = normalizePostalCode(fields.postalCode.value);
        const userData = {
            firstName: fields.firstName.value.trim(),
            lastName: fields.lastName.value.trim(),
            email: fields.email.value.trim(),
            streetAddress: fields.streetAddress.value.trim(),
            city: fields.city.value.trim(),
            province: fields.province.value,
            postalCode: normalizedPostal
        };

        // Set loading state
        setLoading(true);
        hideError();
        mpResult.classList.add('hidden');

        // Record this request for rate limiting
        recordRequest();

        try {
            // Fetch MP data
            const data = await fetchMpData(normalizedPostal);

            // Select federal MP
            const mp = selectFederalMp(data);

            if (!mp) {
                showError('Could not find a federal MP for this postal code. The postal code may be invalid or cover multiple ridings.');
                return;
            }

            // Display result
            displayMpResult(mp, userData);
        } catch (error) {
            console.error('Error fetching MP data:', error);
            showError(error.message || 'Failed to look up your MP. Please try again or use the manual lookup.');
        } finally {
            setLoading(false);
        }
    }

    /**
     * Handle copy email button click
     */
    async function handleCopyEmail() {
        if (!currentMp) {
            return;
        }

        const subject = emailSubjectField.value;
        const body = emailBodyField.value;

        const fullEmailText = generateFullEmailText(
            currentMp.email,
            subject,
            body,
            CC_EMAILS
        );

        try {
            await navigator.clipboard.writeText(fullEmailText);
            copyFeedback.classList.remove('hidden');
            setTimeout(() => {
                copyFeedback.classList.add('hidden');
            }, 3000);
        } catch (error) {
            // Fallback for older browsers
            const textarea = document.createElement('textarea');
            textarea.value = fullEmailText;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();

            try {
                document.execCommand('copy');
                copyFeedback.classList.remove('hidden');
                setTimeout(() => {
                    copyFeedback.classList.add('hidden');
                }, 3000);
            } catch (err) {
                alert('Failed to copy. Please select and copy the text manually.');
            }

            document.body.removeChild(textarea);
        }
    }

    /**
     * Handle field input for real-time validation clearing
     */
    function handleFieldInput(e) {
        const field = e.target;
        if (field.classList.contains('invalid')) {
            clearFieldError(field);
        }
    }

    // ============================================
    // Initialization
    // ============================================

    function init() {
        // Form submission
        form.addEventListener('submit', handleFormSubmit);

        // Copy button
        copyEmailBtn.addEventListener('click', handleCopyEmail);

        // Real-time validation clearing
        Object.values(fields).forEach(field => {
            field.addEventListener('input', handleFieldInput);
        });

        // Postal code formatting on blur
        fields.postalCode.addEventListener('blur', function () {
            const normalized = normalizePostalCode(this.value);
            if (normalized.length === 6) {
                // Format as A1A 1A1
                this.value = normalized.substring(0, 3) + ' ' + normalized.substring(3);
            }
        });

        // Update mailto link when email subject or body changes
        emailSubjectField.addEventListener('input', updateEmailLinks);
        emailBodyField.addEventListener('input', updateEmailLinks);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ============================================
    // Test Harness (Development Helper)
    // ============================================

    /**
     * Test harness for development
     * Run in browser console: testPostalCodes()
     */
    window.testPostalCodes = async function () {
        const testCodes = [
            { code: 'K1A 0A6', description: 'Parliament Hill area (Ottawa)' },
            { code: 'M5V 3L9', description: 'Downtown Toronto' },
            { code: 'V6B 1A1', description: 'Downtown Vancouver' }
        ];

        console.log('=== MP Lookup Test Harness ===\n');

        for (const test of testCodes) {
            const normalized = normalizePostalCode(test.code);
            console.log(`Testing: ${test.code} (${test.description})`);
            console.log(`Normalized: ${normalized}`);

            try {
                const data = await fetchMpData(normalized);
                const mp = selectFederalMp(data);

                if (mp) {
                    const email = mp.email || deriveEmailFromName(mp.name);
                    console.log(`  MP Found: ${mp.name}`);
                    console.log(`  Riding: ${mp.district_name || 'N/A'}`);
                    console.log(`  Email: ${email}`);
                    console.log(`  Status: PASS\n`);
                } else {
                    console.log(`  Status: FAIL - No MP found`);
                    console.log(`  Raw data:`, data);
                    console.log('\n');
                }
            } catch (error) {
                console.log(`  Status: FAIL - ${error.message}\n`);
            }
        }

        console.log('=== Test Complete ===');
    };

    /**
     * Test email derivation
     * Run in browser console: testEmailDerivation()
     */
    window.testEmailDerivation = function () {
        const testNames = [
            'Justin Trudeau',
            'Pierre Poilievre',
            'Jagmeet Singh',
            'Jean-Yves Duclos',
            'Marie-Claude Bibeau',
            'François-Philippe Champagne'
        ];

        console.log('=== Email Derivation Test ===\n');

        testNames.forEach(name => {
            const email = deriveEmailFromName(name);
            console.log(`${name} => ${email}`);
        });

        console.log('\n=== Test Complete ===');
    };
})();
