/**
 * @file DocGen report generation API endpoint
 * @description Vercel serverless function that generates Excel data exports.
 *
 * POST /api/docgen/generate
 * Body: { caseId, reportType, tagIds }
 * Headers: Authorization: Bearer <supabase_jwt>
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { GenerateReportRequestSchema } from '../../src/lib/docgen/types';
import { convertSplitsToExcel } from '../../src/lib/docgen/excel-generator';
import { getReportDisplayName } from '../../src/lib/docgen/prompts';
import type { Database } from '../../src/types/database';

/** Extend timeout for AI report generation (Pro plan: up to 300s) */
export const config = {
  maxDuration: 300,
};

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[docgen] Request received:', req.method, req.body?.reportType);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Extract and validate JWT
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase environment is not configured' });
  }

  // 2. Create authenticated Supabase client for permission checks
  const supabase = createClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  // 2b. Create service role client for storage (JWT may expire during long AI generation)
  const supabaseAdmin = createClient<Database>(
    SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 3. Validate request body
  const parseResult = GenerateReportRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Invalid request',
      details: parseResult.error.message,
    });
  }

  const { caseId, reportType, tagIds } = parseResult.data;

  try {
    // 4. Run all independent queries in parallel for faster response
    const [caseResult, splitsResult, userResult] = await Promise.all([
      // Verify user owns case
      supabase
        .from('cases')
        .select('id')
        .eq('id', caseId)
        .single(),

      // Fetch splits ready for export (complete or needs_review)
      supabase
        .from('splits')
        .select('id, tag_id, document_date, identifier, potential_duplicate, extracted_data, documents!inner(case_id)')
        .eq('documents.case_id', caseId)
        .in('extraction_status', ['complete', 'needs_review'])
        .in('tag_id', tagIds)
        .not('extracted_data', 'is', null),

      // Get current user ID
      supabase.auth.getUser(),
    ]);

    // 5. Handle errors from parallel queries
    const { data: caseData, error: caseError } = caseResult;
    if (caseError || !caseData) {
      return res.status(404).json({ error: 'Case not found' });
    }

    const { data: splits, error: splitsError } = splitsResult;
    if (splitsError) {
      return res.status(500).json({ error: 'Failed to fetch data' });
    }

    if (!splits || splits.length === 0) {
      return res.status(404).json({
        error: 'No extracted data found',
        details: 'Complete document extraction before generating reports',
      });
    }

    const { data: { user } } = userResult;
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // 7. Generate Excel report
    console.log('[docgen] Generating quick report');
    const fileBuffer = await convertSplitsToExcel(
      splits.map(s => ({
        id: s.id,
        tag_id: s.tag_id,
        document_date: s.document_date as string | null,
        identifier: s.identifier as string | null,
        potential_duplicate: s.potential_duplicate as string | null,
        extracted_data: s.extracted_data as Record<string, unknown> | null,
      }))
    );
    const fileExtension = 'xlsx';
    const contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    // 9. Upload to Supabase Storage
    const timestamp = Date.now();
    const fileName = `${timestamp}_${reportType}.${fileExtension}`;
    const filePath = `${caseId}/${fileName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from('reports')
      .upload(filePath, fileBuffer, { contentType, upsert: false });

    if (uploadError) {
      console.error('Storage upload failed:', uploadError);
      return res.status(500).json({ error: 'Failed to store report' });
    }

    // 10. Insert into report_history
    const fileSizeBytes = fileBuffer instanceof Buffer
      ? fileBuffer.length
      : fileBuffer.byteLength;

    const { data: report, error: insertError } = await supabaseAdmin
      .from('report_history')
      .insert({
        case_id: caseId,
        report_type: reportType,
        name: getReportDisplayName(reportType),
        file_path: filePath,
        file_size_bytes: fileSizeBytes,
        splits_count: splits.length,
        tags_included: tagIds,
        generated_by: user.id,
      })
      .select('id')
      .single();

    if (insertError || !report) {
      console.error('Failed to insert report history:', insertError);
    }

    // 11. Generate signed download URL
    const expiresIn = 3600; // 1 hour
    const { data: signedUrl, error: urlError } = await supabaseAdmin.storage
      .from('reports')
      .createSignedUrl(filePath, expiresIn);

    if (urlError || !signedUrl) {
      return res.status(500).json({ error: 'Failed to generate download URL' });
    }

    // 12. Return success response
    return res.status(200).json({
      reportId: report?.id ?? 'unknown',
      downloadUrl: signedUrl.signedUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      metadata: {
        reportType,
        splitsCount: splits.length,
        tagsIncluded: tagIds,
        fileSizeBytes,
      },
    });

  } catch (error) {
    console.error('Report generation failed:', error);
    return res.status(500).json({
      error: 'Report generation failed',
    });
  }
}
