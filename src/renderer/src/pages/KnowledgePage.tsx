import { useCallback, useEffect, useState } from 'react'
import { FileText, FolderPlus, Upload, Search, Pencil, Trash2 } from 'lucide-react'
import type { DocumentInfo, Preview, Project } from '../../../shared/types'
import { useApp } from '../stores/app'
import { Button } from '../components/ui/button'
import { Dialog } from '../components/Dialog'
type Editor = { id: string; name: string; text: string; preview: boolean; warning?: string }
export function KnowledgePage() {
  const { data, setData, notify } = useApp()
  const [selected, setSelected] = useState('')
  const [documents, setDocuments] = useState<DocumentInfo[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<{ type: 'project' | 'document'; id: string; name: string } | null>(
    null
  )
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ text: string; source: string; score: number }[] | null>(null)
  const projects = data!.projects
  const active = projects.find((p) => p.id === selected)
  const refresh = useCallback(async (): Promise<void> => {
    setData(await window.meetpilot.bootstrap())
  }, [setData])
  useEffect(() => {
    let disposed = false
    setDocuments([])
    setResults(null)
    if (selected)
      void window.meetpilot
        .documents(selected)
        .then((rows) => {
          if (!disposed) setDocuments(rows)
        })
        .catch((e) => notify(String(e)))
    return () => {
      disposed = true
    }
  }, [selected, notify])
  const run = (action: () => Promise<void>): void => {
    setBusy(true)
    void action()
      .catch((e) => notify(String(e)))
      .finally(() => setBusy(false))
  }
  const reloadDocuments = async (): Promise<void> => {
    setDocuments(await window.meetpilot.documents(selected))
    setResults(null)
  }
  const preview = (value: Preview): void => {
    setConsent(false)
    setEditor({ ...value, preview: true })
  }
  return (
    <div className="settings-stack">
      <section className="card">
        <div className="section-heading">
          <div>
            <h3>Your project library</h3>
            <p>
              Review documents locally, then explicitly approve the text sent to OpenAI for indexing. Selected
              excerpts can inform meeting answers.
            </p>
          </div>
          <Button disabled={busy} onClick={() => setProject({ id: '', name: '', description: '' })}>
            <FolderPlus size={16} />
            New project
          </Button>
        </div>
        <label htmlFor="knowledge-project">Project</label>
        <select
          id="knowledge-project"
          disabled={busy}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Choose a project</option>
          {projects.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {active && (
          <>
            <p>{active.description || 'Add a description to explain this project.'}</p>
            <div className="actions spaced">
              <Button disabled={busy} variant="secondary" onClick={() => setProject(active)}>
                <Pencil size={14} />
                Edit project
              </Button>
              <Button
                disabled={busy}
                variant="destructive"
                onClick={() => setConfirm({ type: 'project', id: active.id, name: active.name })}
              >
                <Trash2 size={14} />
                Delete project
              </Button>
            </div>
          </>
        )}
      </section>
      {active ? (
        <>
          <section className="card">
            <div className="section-heading">
              <h3>Reviewed documents · {documents.length}</h3>
              <Button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const values = await window.meetpilot.previewDocuments()
                    if (values[0]) preview(values[0])
                  })
                }
              >
                <Upload size={15} />
                Review a document
              </Button>
            </div>
            <p>
              Text, Markdown, or text-based PDF · up to 5 MB and 120,000 characters. Remove credentials and
              private information before import.
            </p>
            {documents.length ? (
              documents.map((document) => (
                <div className="document-row" key={document.id}>
                  <FileText size={20} />
                  <div>
                    <strong>{document.name}</strong>
                    <p>
                      {document.chunks} excerpts · {new Date(document.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    disabled={busy}
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      run(async () => {
                        const value = await window.meetpilot.document(document.id)
                        setConsent(false)
                        setEditor({ ...value, preview: false })
                      })
                    }
                  >
                    Review / edit
                  </Button>
                  <Button
                    disabled={busy}
                    variant="ghost"
                    size="sm"
                    aria-label={'Delete ' + document.name}
                    onClick={() => setConfirm({ type: 'document', id: document.id, name: document.name })}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              ))
            ) : (
              <div className="empty">
                <FileText size={28} />
                <h3>No documents yet</h3>
                <p>Import only the context you want this project to use.</p>
              </div>
            )}
          </section>
          <section className="card">
            <h3>
              <Search size={17} /> Find project context
            </h3>
            <p>Search sends your query to OpenAI to find relevant excerpts in this project's local index.</p>
            <form
              className="actions spaced"
              onSubmit={(e) => {
                e.preventDefault()
                run(async () => setResults(await window.meetpilot.searchKnowledge(selected, query)))
              }}
            >
              <input
                aria-label="Knowledge search"
                maxLength={4000}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="How does authentication work?"
              />
              <Button disabled={busy || !query.trim() || !documents.length || data!.settings.mockMode}>
                Search with OpenAI
              </Button>
            </form>
            {results?.length === 0 && (
              <p className="spaced" role="status">
                No relevant excerpts found.
              </p>
            )}
            {results?.map((result, i) => (
              <article className="history-answer" key={i}>
                <strong>{result.source}</strong>
                <p>{result.text}</p>
              </article>
            ))}
          </section>
        </>
      ) : (
        <section className="card empty">
          <FolderPlus size={30} />
          <h3>A little context goes a long way</h3>
          <p>Create or choose a project to manage its documents.</p>
        </section>
      )}
      {project && (
        <Dialog
          title={project.id ? 'Edit project' : 'Create a project'}
          onClose={() => {
            if (!busy) setProject(null)
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault()
              run(async () => {
                const saved = await window.meetpilot.saveProject(project)
                await refresh()
                setSelected(saved.id)
                setProject(null)
              })
            }}
          >
            <label htmlFor="project-name">Name</label>
            <input
              id="project-name"
              required
              maxLength={100}
              value={project.name}
              onChange={(e) => setProject({ ...project, name: e.target.value })}
            />
            <label htmlFor="project-description">Description</label>
            <textarea
              id="project-description"
              maxLength={2000}
              rows={4}
              value={project.description}
              onChange={(e) => setProject({ ...project, description: e.target.value })}
            />
            <div className="actions spaced">
              <Button disabled={busy || !project.name.trim()}>{busy ? 'Saving…' : 'Save project'}</Button>
              <Button type="button" disabled={busy} variant="ghost" onClick={() => setProject(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </Dialog>
      )}
      {editor && (
        <Dialog
          title={editor.preview ? 'Review before importing' : 'Edit reviewed document'}
          onClose={() => {
            if (!busy) setEditor(null)
          }}
        >
          <p>
            This text stays local until you approve indexing. Editing an imported document replaces its saved
            text and embeddings.
          </p>
          {editor.warning && <div className="notice">{editor.warning}</div>}
          <label htmlFor="document-name">Document name</label>
          <input
            id="document-name"
            disabled={editor.preview || busy}
            maxLength={200}
            value={editor.name}
            onChange={(e) => setEditor({ ...editor, name: e.target.value })}
          />
          <label htmlFor="reviewed-text">
            Text to index · {editor.text.length.toLocaleString()} characters
          </label>
          <textarea
            id="reviewed-text"
            disabled={busy}
            rows={12}
            maxLength={120000}
            value={editor.text}
            onChange={(e) => {
              setConsent(false)
              setEditor({ ...editor, text: e.target.value })
            }}
          />
          <label className="check">
            <input
              type="checkbox"
              checked={consent}
              disabled={busy}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I reviewed this text and approve sending it to OpenAI for embeddings. Relevant excerpts may be
            used in this project's meeting answers.
          </label>
          {data!.settings.mockMode && <p>Turn off mock mode in Settings to import with OpenAI.</p>}
          <div className="actions">
            <Button
              disabled={
                busy || !consent || !editor.text.trim() || !editor.name.trim() || data!.settings.mockMode
              }
              onClick={() =>
                run(async () => {
                  if (editor.preview) await window.meetpilot.importDocument(selected, editor.id, editor.text)
                  else await window.meetpilot.updateDocument(editor.id, editor.name, editor.text)
                  await reloadDocuments()
                  setEditor(null)
                })
              }
            >
              {busy ? 'Indexing…' : 'Approve & index'}
            </Button>
            <Button disabled={busy} variant="ghost" onClick={() => setEditor(null)}>
              Cancel
            </Button>
          </div>
        </Dialog>
      )}
      {confirm && (
        <Dialog
          title={'Delete ' + confirm.name + '?'}
          onClose={() => {
            if (!busy) setConfirm(null)
          }}
        >
          <p>
            {confirm.type === 'project'
              ? 'This removes the project and its documents. Meeting history is kept without a project association.'
              : 'This removes the local document and its index. It does not change earlier meeting answers or provider retention.'}
          </p>
          <div className="actions">
            <Button
              disabled={busy}
              variant="destructive"
              onClick={() =>
                run(async () => {
                  if (confirm.type === 'project') {
                    await window.meetpilot.deleteProject(confirm.id)
                    await refresh()
                    setSelected('')
                  } else {
                    await window.meetpilot.deleteDocument(confirm.id)
                    await reloadDocuments()
                  }
                  setConfirm(null)
                })
              }
            >
              Delete permanently
            </Button>
            <Button disabled={busy} variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
