import type pg from 'pg';

/** A written post in someone's data export. */
export interface ExportedPost {
  id: string;
  type: string;
  title: string | null;
  body: string;
  status: string;
  language: string;
  meme: boolean;
  sourceCredit: string | null;
  /** the narration, when there is one */
  audioUrl: string | null;
  pictures: Array<{ url: string | null; altText: string | null }>;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

/** A picture post (the kind made before written posts took pictures) in an export. */
export interface ExportedPicturePost {
  id: string;
  url: string | null;
  caption: string | null;
  category: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Everything someone posted, for their data export (KUR-024): their written
 * posts with the pictures on them, and their older picture posts — drafts and
 * removed ones too, since we still hold those. Pictures are links to the files
 * rather than the files: the export is a document, and the links are what the
 * person can open.
 */
export async function exportPosts(
  executor: Pick<pg.Pool, 'query'>,
  userId: string,
  publicUrl: (key: string) => string | null,
): Promise<{ written: ExportedPost[]; pictures: ExportedPicturePost[] }> {
  const written = await executor.query<{
    id: string; type: string; title: string | null; body: string; status: string; language: string;
    is_meme: boolean; source_credit: string | null; audio_media_id: string | null;
    created_at: Date; updated_at: Date; published_at: Date | null;
    pictures: Array<{ key: string; alt: string | null }>;
  }>(
    `SELECT p.id, p.type, p.title, p.body, p.status, p.language, p.is_meme, p.source_credit, p.audio_media_id,
            p.created_at, p.updated_at, p.published_at,
            COALESCE((SELECT json_agg(json_build_object('key', m.media_key, 'alt', m.alt_text) ORDER BY m.position)
                        FROM library_post_media m WHERE m.post_id = p.id), '[]'::json) AS pictures
       FROM library_posts p WHERE p.author_id = $1 ORDER BY p.created_at`,
    [userId],
  );
  const pictures = await executor.query<{
    id: string; image_media_id: string; caption: string | null; category: string; status: string;
    created_at: Date; updated_at: Date;
  }>(
    `SELECT id, image_media_id, caption, category, status, created_at, updated_at
       FROM image_posts WHERE author_id = $1 ORDER BY created_at`,
    [userId],
  );
  return {
    written: written.rows.map((r) => ({
      id: r.id, type: r.type, title: r.title, body: r.body, status: r.status, language: r.language,
      meme: r.is_meme, sourceCredit: r.source_credit,
      audioUrl: r.audio_media_id ? publicUrl(r.audio_media_id) : null,
      pictures: r.pictures.map((m) => ({ url: publicUrl(m.key), altText: m.alt })),
      createdAt: r.created_at, updatedAt: r.updated_at, publishedAt: r.published_at,
    })),
    pictures: pictures.rows.map((r) => ({
      id: r.id, url: publicUrl(r.image_media_id), caption: r.caption, category: r.category, status: r.status,
      createdAt: r.created_at, updatedAt: r.updated_at,
    })),
  };
}
