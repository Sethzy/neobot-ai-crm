-- Add page dimensions to splits table for accurate highlight positioning
ALTER TABLE splits
ADD COLUMN page_width REAL,
ADD COLUMN page_height REAL;

COMMENT ON COLUMN splits.page_width IS 'PDF page width in points (72 DPI)';
COMMENT ON COLUMN splits.page_height IS 'PDF page height in points (72 DPI)';
