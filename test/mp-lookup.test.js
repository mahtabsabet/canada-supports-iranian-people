const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { selectFederalMp } = require('../mp-select.js');

const REPRESENT_API = 'https://represent.opennorth.ca';

/**
 * Fetch representatives for a postal code directly from OpenNorth API.
 */
async function fetchReps(postalCode) {
    const normalized = postalCode.replace(/\s+/g, '').toUpperCase();
    const res = await fetch(`${REPRESENT_API}/postcodes/${normalized}/`);
    if (!res.ok) {
        throw new Error(`API returned ${res.status} for ${postalCode}`);
    }
    return res.json();
}

// Postal codes spanning all provinces with expected MP and riding
const POSTAL_CODES = [
    { code: 'K1A 0A6', location: 'Ottawa, ON (Parliament Hill)', expectedMp: 'Yasir Naqvi', expectedRiding: 'Ottawa Centre' },
    { code: 'M9V 2B2', location: 'Etobicoke North, Toronto, ON', expectedMp: 'John Zerucelli', expectedRiding: 'Etobicoke North' },
    { code: 'V6B 1A1', location: 'Downtown Vancouver, BC', expectedMp: 'Jenny Kwan', expectedRiding: 'Vancouver East' },
    { code: 'T2P 1J9', location: 'Downtown Calgary, AB', expectedMp: 'Greg McLean', expectedRiding: 'Calgary Centre' },
    { code: 'R3C 1A6', location: 'Downtown Winnipeg, MB', expectedMp: 'Leah Gazan', expectedRiding: 'Winnipeg Centre' },
    { code: 'H2X 1Y4', location: 'Downtown Montreal, QC', expectedMp: 'Steven Guilbeault', expectedRiding: 'Laurier\u2014Sainte-Marie' },
    { code: 'E1C 1G1', location: 'Moncton, NB', expectedMp: 'Ginette Petitpas Taylor', expectedRiding: 'Moncton\u2014Dieppe' },
    { code: 'B3H 1A1', location: 'Halifax, NS', expectedMp: 'Shannon Miedema', expectedRiding: 'Halifax' },
    { code: 'C1A 1A1', location: 'Charlottetown, PE', expectedMp: 'Sean Casey', expectedRiding: 'Charlottetown' },
    { code: 'A1B 1A1', location: "St. John's, NL", expectedMp: 'Joanne Thompson', expectedRiding: "St. John's East" },
    { code: 'S4P 1A1', location: 'Regina, SK', expectedMp: 'Michael Kram', expectedRiding: 'Regina\u2014Wascana' },
];

describe('MP lookup across Canada', { timeout: 30_000 }, () => {
    for (const { code, location, expectedMp, expectedRiding } of POSTAL_CODES) {
        it(`${code} (${location}) → ${expectedMp}`, async () => {
            const data = await fetchReps(code);
            const mp = selectFederalMp(data);

            // Must find an MP
            assert.notEqual(mp, null, `No federal MP found for ${code}`);

            // elected_office must be exactly "MP" (not MPP, MLA, etc.)
            assert.equal(
                mp.elected_office,
                'MP',
                `Expected elected_office "MP" but got "${mp.elected_office}" for ${code}`
            );

            // representative_set_name must reference House of Commons
            assert.match(
                mp.representative_set_name,
                /House of Commons|Chambre des communes/,
                `representative_set_name "${mp.representative_set_name}" doesn't reference House of Commons for ${code}`
            );

            // Must be the expected MP
            assert.equal(
                mp.name,
                expectedMp,
                `Expected MP "${expectedMp}" but got "${mp.name}" for ${code}`
            );

            // Must be the expected riding
            assert.equal(
                mp.district_name,
                expectedRiding,
                `Expected riding "${expectedRiding}" but got "${mp.district_name}" for ${code}`
            );
        });
    }
});

describe('Doug Ford bug regression', { timeout: 15_000 }, () => {
    it('M9V 2B2 must return John Zerucelli, NOT Doug Ford (MPP)', async () => {
        const data = await fetchReps('M9V 2B2');
        const mp = selectFederalMp(data);

        assert.notEqual(mp, null, 'No federal MP found for M9V 2B2');

        // The bug was that selectFederalMp matched "MPP" because it contained "MP"
        assert.equal(mp.elected_office, 'MP');
        assert.equal(mp.name, 'John Zerucelli');
        assert.doesNotMatch(
            mp.name,
            /Doug Ford/i,
            `Got Doug Ford (provincial premier) instead of a federal MP`
        );
    });
});

describe('selectFederalMp edge cases', () => {
    it('returns null for null input', () => {
        assert.equal(selectFederalMp(null), null);
    });

    it('returns null for empty representatives', () => {
        assert.equal(selectFederalMp({ representatives_centroid: [] }), null);
    });

    it('returns null when no federal MP exists in data', () => {
        const data = {
            representatives_centroid: [
                { elected_office: 'MPP', name: 'Some MPP', representative_set_name: 'Ontario' },
                { elected_office: 'Councillor', name: 'Some Councillor', representative_set_name: 'City Council' },
            ]
        };
        assert.equal(selectFederalMp(data), null);
    });

    it('selects MP even among other representatives', () => {
        const data = {
            representatives_centroid: [
                { elected_office: 'MPP', name: 'Provincial Person', representative_set_name: 'Ontario' },
                { elected_office: 'MP', name: 'Federal Person', representative_set_name: 'House of Commons' },
                { elected_office: 'Councillor', name: 'City Person', representative_set_name: 'City Council' },
            ]
        };
        const mp = selectFederalMp(data);
        assert.equal(mp.name, 'Federal Person');
        assert.equal(mp.elected_office, 'MP');
    });
});
