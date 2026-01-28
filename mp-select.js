/**
 * Select the federal MP from OpenNorth Represent API response.
 * Shared between main.js (inline copy) and tests.
 */
function selectFederalMp(data) {
    if (!data || !data.representatives_centroid) {
        return null;
    }

    const reps = data.representatives_centroid;

    // Look for federal MP (House of Commons)
    const mp = reps.find(rep => {
        const office = (rep.elected_office || '').toLowerCase();
        const repSet = (rep.representative_set_name || '').toLowerCase();

        return (
            office === 'mp' ||
            office.includes('member of parliament') ||
            repSet.includes('house of commons') ||
            repSet.includes('chambre des communes')
        );
    });

    return mp || null;
}

module.exports = { selectFederalMp };
