/**
 * @fileoverview Tests for image upload utilities.
 */
import { describe, it, expect } from 'vitest';
import { validateImageFile, fileToBase64 } from './image-utils';

describe('image-utils', () => {
  describe('validateImageFile', () => {
    it('accepts valid PNG file under size limit', () => {
      const file = new File(['x'.repeat(1000)], 'screenshot.png', { type: 'image/png' });
      const result = validateImageFile(file);
      expect(result).toEqual({ valid: true });
    });

    it('rejects file over 5MB', () => {
      const file = new File(['x'.repeat(6 * 1024 * 1024)], 'large.png', { type: 'image/png' });
      const result = validateImageFile(file);
      expect(result).toEqual({ valid: false, error: 'Image must be under 5MB' });
    });

    it('rejects non-image file', () => {
      const file = new File(['test'], 'doc.pdf', { type: 'application/pdf' });
      const result = validateImageFile(file);
      expect(result).toEqual({ valid: false, error: 'Only images are supported (PNG, JPG, WebP, GIF)' });
    });
  });

  describe('fileToBase64', () => {
    it('converts file to base64 string', async () => {
      const content = 'test image content';
      const file = new File([content], 'test.png', { type: 'image/png' });
      const result = await fileToBase64(file);
      // Base64 of 'test image content'
      expect(result).toBe('dGVzdCBpbWFnZSBjb250ZW50');
    });
  });
});
