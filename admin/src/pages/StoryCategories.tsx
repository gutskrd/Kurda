import { useMemo, useState } from 'react';
import { APP_LOCALES, STORY_CATEGORY_NAME_MAX, STORY_CATEGORY_SLUG_PATTERN, localeDir, type StoryCategory } from '@kurda/shared';
import { categoryCounts, categoryInUse, createCategory, deleteCategory, listCategories, updateCategory } from '../storiesApi';
import { Badge, Button, Drawer, FieldRow, FormActions, Icon, PageHeader, Section, Table, TextInput, errorLine, useDialogs, useLoad, useToast, type Column } from '../ui';

const BACK = { href: '#/stories', label: 'All stories' };

/** The interface languages a category is named in, English first since it is required and the fallback. */
const NAME_LOCALES = ['en', ...APP_LOCALES.map((l) => l.code).filter((c) => c !== 'en')] as const;

/** "Çîrokên gelêrî" → "cirokhen-geleri": a slug from a name, as far as Latin letters go. */
export function categorySlugFrom(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * The library's categories (#/stories/categories): what a story is filed
 * under, named per interface language, in the order the library lists them.
 * A category is added, renamed, moved and deleted here; deleting one that
 * stories are filed under asks again, with the count, before it unfiles them.
 */
export function StoryCategories(): React.JSX.Element {
  const toast = useToast();
  const dialogs = useDialogs();
  const categories = useLoad(listCategories, []);
  const slugs = useMemo(() => (categories.data ?? []).map((c) => c.slug), [categories.data]);
  const counts = useLoad(() => (slugs.length > 0 ? categoryCounts(slugs) : Promise.resolve<Record<string, number>>({})), [slugs.join(' ')]);
  const [editing, setEditing] = useState<StoryCategory | 'new' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const rows = categories.data ?? null;

  /**
   * Move a category one place up or down: the two rows trade positions. Rows
   * sharing a position (a list made by hand) are renumbered first, in the
   * order shown, so the trade means something.
   */
  async function move(c: StoryCategory, step: -1 | 1): Promise<void> {
    if (!rows) return;
    const at = rows.findIndex((r) => r.slug === c.slug);
    const to = at + step;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[at], next[to]] = [next[to]!, next[at]!];
    const distinct = new Set(rows.map((r) => r.position)).size === rows.length;
    setBusy(c.slug);
    try {
      if (distinct) {
        // the moved row takes its neighbour's place, then the neighbour takes the moved row's
        await updateCategory(c.slug, { name: c.name, position: rows[to]!.position });
        await updateCategory(rows[to]!.slug, { name: rows[to]!.name, position: c.position });
      } else {
        for (const [i, row] of next.entries()) await updateCategory(row.slug, { name: row.name, position: i });
      }
      await categories.reload();
    } catch (err) {
      toast.error(errorLine(err, 'categories'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(c: StoryCategory): Promise<void> {
    const yes = await dialogs.confirm({
      title: `Delete “${c.name.en}”?`,
      body: 'It leaves the library’s filters. Stories filed under it keep their text; you will be asked again if there are any.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!yes) return;
    setBusy(c.slug);
    try {
      try {
        await deleteCategory(c.slug);
      } catch (err) {
        const n = categoryInUse(err);
        if (n === null) throw err;
        const force = await dialogs.confirm({
          title: `${n} ${n === 1 ? 'story uses' : 'stories use'} “${c.name.en}”`,
          body: `Remove it from ${n === 1 ? 'that story' : 'them'} and delete? ${n === 1 ? 'It' : 'They'} will have no category until an editor files ${n === 1 ? 'it' : 'them'} again, and cannot be published before that.`,
          confirmLabel: 'Remove it from them and delete',
          tone: 'danger',
        });
        if (!force) return;
        await deleteCategory(c.slug, true);
      }
      toast.success(`Deleted “${c.name.en}”.`);
      await categories.reload();
    } catch (err) {
      toast.error(errorLine(err, 'categories'));
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<StoryCategory>[] = [
    {
      key: 'name',
      header: 'Category',
      card: 'title',
      cell: (c) => (
        <>
          <strong>{c.name.en}</strong>
          <span className="cell-sub">
            {NAME_LOCALES.filter((l) => l !== 'en' && c.name[l])
              .map((l) => c.name[l])
              .join(' · ') || 'English only'}
          </span>
        </>
      ),
    },
    { key: 'slug', header: 'Slug', cell: (c) => <code className="mono">{c.slug}</code> },
    { key: 'position', header: 'Position', align: 'end', cell: (c) => c.position },
    {
      key: 'count',
      header: 'Stories',
      align: 'end',
      cell: (c) => {
        const n = counts.data?.[c.slug];
        return n === undefined ? <span className="subtle">…</span> : n === 0 ? <Badge>None</Badge> : n;
      },
    },
  ];

  return (
    <div>
      <PageHeader
        back={BACK}
        title="Story categories"
        subtitle="What the library files a story under, named in each interface language (English is required), in the order the library lists them."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing('new')}>
            New category
          </Button>
        }
      />
      <Section flush>
        <Table
          caption="Story categories"
          columns={columns}
          rows={rows}
          rowKey={(c) => c.slug}
          loading={categories.loading}
          error={categories.error}
          onRetry={() => void categories.reload()}
          what="story categories"
          empty="No categories yet. Add the first with “New category”."
          wide="medium"
          actions={(c) => {
            const at = rows?.findIndex((r) => r.slug === c.slug) ?? -1;
            return (
              <>
                <Button onClick={() => setEditing(c)} disabled={busy !== null}>
                  Rename
                </Button>
                <Button variant="ghost" aria-label={`Move “${c.name.en}” up`} disabled={busy !== null || at <= 0} onClick={() => void move(c, -1)}>
                  <Icon name="chevronUp" />
                </Button>
                <Button variant="ghost" aria-label={`Move “${c.name.en}” down`} disabled={busy !== null || at < 0 || at >= (rows?.length ?? 0) - 1} onClick={() => void move(c, 1)}>
                  <Icon name="chevronDown" />
                </Button>
                <Button variant="danger" onClick={() => void remove(c)} disabled={busy !== null}>
                  Delete
                </Button>
              </>
            );
          }}
        />
      </Section>
      {editing && (
        <CategoryForm
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (saved, created) => {
            setEditing(null);
            toast.success(created ? `Added “${saved.name.en}”.` : `Saved “${saved.name.en}”.`);
            await categories.reload();
          }}
        />
      )}
    </div>
  );
}

/** A new category (slug and names), or the names of one that exists; the slug is its address and cannot change. */
function CategoryForm({
  category,
  onClose,
  onSaved,
}: {
  category: StoryCategory | null;
  onClose: () => void;
  onSaved: (saved: StoryCategory, created: boolean) => Promise<void>;
}): React.JSX.Element {
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(NAME_LOCALES.map((l) => [l, category?.name[l] ?? ''])));
  const [slug, setSlug] = useState(category?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(category !== null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const slugOk = STORY_CATEGORY_SLUG_PATTERN.test(slug);

  const setName = (locale: string, value: string): void => {
    setNames((n) => ({ ...n, [locale]: value }));
    // the slug follows the English name until the editor writes their own
    if (locale === 'en' && !slugEdited) setSlug(categorySlugFrom(value));
  };

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const name = Object.fromEntries(Object.entries(names).map(([l, v]) => [l, v.trim()]).filter(([, v]) => v !== '')) as StoryCategory['name'];
    if (!name.en) {
      setProblem('Give the category an English name.');
      return;
    }
    if (!category && !slugOk) {
      setProblem('The slug is 2 to 40 lower-case letters, digits and dashes.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      const saved = category ? await updateCategory(category.slug, { name }) : await createCategory(slug, { name });
      await onSaved(saved, category === null);
    } catch (err) {
      setProblem(errorLine(err, 'categories'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={category ? `Rename “${category.name.en}”` : 'New category'}
      footer={
        <FormActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="story-category-form" busy={busy}>
            {busy ? 'Saving…' : category ? 'Save names' : 'Add category'}
          </Button>
        </FormActions>
      }
    >
      <form id="story-category-form" className="form" onSubmit={(e) => void submit(e)}>
        <FieldRow>
          <TextInput
            label="Name in English"
            hint="Required: what the others fall back to."
            value={names.en ?? ''}
            onChange={(e) => setName('en', e.target.value)}
            required
            maxLength={STORY_CATEGORY_NAME_MAX}
            placeholder="Folktales"
            data-autofocus
          />
          <TextInput
            label="Slug"
            hint={category ? 'The address stories are filed under: it cannot change.' : 'Lower case, for the address. Made from the English name until you change it.'}
            value={slug}
            readOnly={category !== null}
            onChange={(e) => {
              setSlugEdited(true);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
            }}
            required
            maxLength={40}
            placeholder="folktale"
            autoCapitalize="off"
            spellCheck={false}
            aria-invalid={!category && slug !== '' && !slugOk ? true : undefined}
          />
        </FieldRow>
        {NAME_LOCALES.filter((l) => l !== 'en').map((l) => {
          const locale = APP_LOCALES.find((x) => x.code === l)!;
          return (
            <TextInput
              key={l}
              label={`Name in ${locale.englishName}`}
              value={names[l] ?? ''}
              onChange={(e) => setName(l, e.target.value)}
              maxLength={STORY_CATEGORY_NAME_MAX}
              lang={l}
              dir={localeDir(l)}
            />
          );
        })}
        {problem && (
          <p className="field-error" role="alert">
            {problem}
          </p>
        )}
      </form>
    </Drawer>
  );
}
