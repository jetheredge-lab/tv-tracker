import { stripHtml } from '../src/services/tvmaze.js';

describe('TVmaze Service & Helpers', () => {
  describe('stripHtml', () => {
    it('should correctly strip HTML tags and unescape entities', () => {
      const input = '<p><b>Severance</b> is a <i>thriller</i> &amp; mystery series.</p>';
      const result = stripHtml(input);
      expect(result).toBe('Severance is a thriller & mystery series.');
    });

    it('should return empty string for null or undefined input', () => {
      expect(stripHtml(null)).toBe('');
      expect(stripHtml(undefined)).toBe('');
      expect(stripHtml('')).toBe('');
    });

    it('should replace non-breaking spaces and quotes', () => {
      const input = 'Mark&#39;s &quot;Innie&quot;&nbsp;life';
      const result = stripHtml(input);
      expect(result).toBe('Mark\'s "Innie" life');
    });
  });
});
