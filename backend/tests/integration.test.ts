import tvmazeService, { stripHtml } from '../src/services/tvmaze.js';

describe('TVmaze Live API Integration', () => {
  it('should search for "Severance" and return structured results', async () => {
    const results = await tvmazeService.searchShows('Severance');
    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    const severance = results.find(s => s.name.toLowerCase() === 'severance');
    expect(severance).toBeDefined();
    expect(severance?.id).toBe(44933);
    expect(stripHtml(severance?.summary)).toContain('Mark');
  });

  it('should fetch show details for Severance (id 44933) with embedded episodes', async () => {
    const show = await tvmazeService.getShowDetails(44933);
    expect(show).toBeDefined();
    expect(show.name).toBe('Severance');
    expect(show.status).toBe('Running');
    expect(show._embedded?.episodes).toBeDefined();
    expect(show._embedded?.episodes?.length).toBeGreaterThan(0);
    const ep1 = show._embedded?.episodes?.[0];
    expect(ep1?.season).toBe(1);
    expect(ep1?.number).toBe(1);
  });
});
