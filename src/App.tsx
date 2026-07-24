// 应用根组件 — 编排层
// 管理会话、终端逻辑、命令路由、Admin 弹层、Skill 弹层
// UI 渲染全部委托给 components/ 下的各子组件

import { useState, useRef, useEffect } from 'react'
import { getSupabase } from './lib/supabase'
import { chat, readStream } from './lib/chat'
import { TOOLS } from './store/commands'
import { fetchAbout, fetchProjects, fetchNews, fetchContact } from './store/api'
import { fetchSkills } from './lib/skills/index'
import {
  searchDocuments,
  deleteDocumentById,
} from './lib/rag'
import { useAuth } from './hooks/useAuth'
import { useSuggestions } from './hooks/useSuggestions'
import { getAuthToken } from './lib/api'
import { Terminal } from './components/Terminal'
import { Welcome } from './components/Welcome'
import { AboutEdit } from './components/modals/AboutEdit'
import { NewsForm } from './components/modals/NewsForm'
import { KBForm } from './components/modals/KBForm'
import { SkillsList } from './components/modals/SkillsList'
import { UpdateLogModal } from './components/modals/UpdateLogModal'
import type {
  Action,
  Line,
  CommandResult,
  UpdateEntry,
  ChatStep,
  Skill,
  PendingFile,
} from './types'
import './App.css'

// 终端命令处理 — 返回字符串或 { output, actions }
const COMMANDS: Record<string, (args: string[]) => Promise<CommandResult>> = {
  about: async () => {
    const text = await fetchAbout()
    return text || 'No content yet.'
  },

  projects: async () => {
    const projects = await fetchProjects()
    return {
      output: 'My projects:',
      actions: projects.map((p) => ({
        label: p.name,
        url: p.disabled ? undefined : p.url,
        disabled: p.disabled,
      })),
    }
  },

  news: async () => {
    const news = await fetchNews()
    return {
      output: 'Click the title to view details:',
      actions: news.map((n) => ({
        label: n.title,
        detail: n.detail,
        inlineActions: [
          { label: '', _edit: { table: 'site_news', title: n.title } },
          { label: '', _delete: { table: 'site_news', title: n.title } },
        ],
      })),
    }
  },

  contact: async () => {
    const contact = await fetchContact()
    return {
      output: 'Get in touch:',
      actions: contact.content
        ? [
            {
              label: '微信公众号',
              detail: contact.content,
              image: contact.image || undefined,
            },
          ]
        : [],
    }
  },
}

// 命令描述 — 用于 autocomplete dropdown 提示
const COMMAND_DESCRIPTIONS: Record<string, string> = {
  about: 'view my profile, skills & work experience',
  projects: 'browse my projects with links',
  news: 'latest company updates (click to expand)',
  contact: 'how to reach me',
  login: 'sign in with email & password',
  register: 'create a new account',
  whoami: 'show current user',
  logout: 'sign out',
  clear: 'clear the screen',
  skills: 'view AI skills',
  'knowledge-base': 'RAG knowledge base search & upload',
  'update-log': 'view changelog grouped by date',
}

// 所有可用命令（含系统命令）
const ALL_COMMANDS = [
  ...Object.keys(COMMANDS),
  'clear',
  'login',
  'register',
  'whoami',
  'logout',
  'skills',
  'knowledge-base',
  'update-log',
]

export default function App() {
  // ==================== 认证状态 ====================
  const {
    user,
    userRef,
    isAdmin,
    isAdminRef,
    passwordMode,
    passwordModeRef,
    realPasswordRef,
    setPasswordMode,
    setRealPassword,
    chatHistoryRef,
    handlePasswordKey,
  } = useAuth()

  // ==================== 终端状态 ====================
  const [history, setHistory] = useState<Line[]>([
    { input: '', output: 'Welcome to ai.sh' },
  ])
  const [input, setInput] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [dropdownIdx, setDropdownIdx] = useState(-1)
  const [hoverIdx, setHoverIdx] = useState(-1)
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [dataVersion, setDataVersion] = useState(0)

  // Skill 状态
  const [skills, setSkills] = useState<Skill[]>([])
  const skillsRef = useRef<Skill[]>([])
  const [skillModal, setSkillModal] = useState(false)
  const skillModalRef = useRef(false)
  const [updateLogModal, setUpdateLogModal] = useState(false)
  const updateLogModalRef = useRef(false)
  updateLogModalRef.current = updateLogModal

  // 模型信息（从 Edge Function 获取）
  const [modelInfo, setModelInfo] = useState<{ provider: string; model: string } | null>(null)

  // 待上传文件
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null)

  skillsRef.current = skills
  skillModalRef.current = skillModal

  // Admin 弹层状态
  const [adminSection, setAdminSection] = useState<string | null>(null)
  const [adminText, setAdminText] = useState('')
  const [newsTitle, setNewsTitle] = useState('')
  const [newsDetail, setNewsDetail] = useState('')
  const [newsEditDocId, setNewsEditDocId] = useState<number | null>(null)
  const [kbTitle, setKbTitle] = useState('')
  const [kbContent, setKbContent] = useState('')
  const [kbEditId, setKbEditId] = useState<number | null>(null)
  const [newsEditId, setNewsEditId] = useState('')
  const adminSectionRef = useRef<string | null>(null)
  adminSectionRef.current = adminSection

  // 更新日志
  const [updates, setUpdates] = useState<UpdateEntry[]>([])
  const updatesRef = useRef<UpdateEntry[]>([])
  updatesRef.current = updates

  // DOM refs
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ref 同步 — 确保事件闭包中能读到最新值
  const inputRef = useRef(input)
  const suggestionRef = useRef(suggestion)
  const historyRef = useRef(history)
  const historyIdxRef = useRef(historyIdx)
  const dropdownRef = useRef<string[]>([])
  const dropdownIdxRef = useRef(-1)

  inputRef.current = input
  suggestionRef.current = suggestion
  historyRef.current = history
  historyIdxRef.current = historyIdx
  dropdownIdxRef.current = dropdownIdx

  // AI 推荐问题
  const suggestions = useSuggestions(dataVersion)

  // ==================== 副作用 ====================

  // 滚动到底部
  useEffect(() => {
    requestAnimationFrame(() => {
      const el = containerRef.current?.querySelector('.overflow-y-auto')
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [history])

  // 初始化 dataVersion
  useEffect(() => {
    setDataVersion((v) => v + 1)
  }, [])

  // 加载 Skills（管理员额外加载 admin skill）
  useEffect(() => {
    const load = async () => {
      const data = await fetchSkills(isAdmin)
      skillsRef.current = data
      setSkills(data)
    }
    load()
  }, [isAdmin])

  // textarea 自适应高度
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 22 * 20) + 'px'
  }, [input])

  // 点击容器自动聚焦
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const cb = () => {
      if (adminSectionRef.current || updateLogModalRef.current) return
      const inp = el.querySelector('input')
      if (inp && document.activeElement !== inp) inp.focus()
    }
    el.addEventListener('click', cb)
    return () => el.removeEventListener('click', cb)
  }, [])

  // 加载更新日志
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}updates.json`)
      .then((r) => r.json())
      .then(setUpdates)
      .catch(() => {})
  }, [])

  // 从 Edge Function 获取模型信息
  useEffect(() => {
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}` },
    })
      .then((r) => r.json())
      .then(setModelInfo)
      .catch(() => {})
  }, [])

  // dropdown 滚动跟随
  useEffect(() => {
    if (dropdownIdx >= 0) {
      document
        .querySelector(`[data-dropdown-idx="${dropdownIdx}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    }
  }, [dropdownIdx])

  // ==================== 命令自动补全 ====================
  useEffect(() => {
    if (passwordModeRef.current) {
      setSuggestion('')
    } else if (input.startsWith('/')) {
      const query = input.slice(1)
      const match = ALL_COMMANDS.find(
        (n) => n.startsWith(query.toLowerCase()) && n !== query.toLowerCase(),
      )
      setSuggestion(match ? '/' + match : '')
    } else {
      setSuggestion('')
    }
    setDropdownIdx(-1)
    setHoverIdx(-1)
  }, [input])

  // 当前下拉候选命令
  const dropdownCommands = input.startsWith('/')
    ? ALL_COMMANDS.filter((n) => n.startsWith(input.slice(1).toLowerCase()))
    : []

  dropdownRef.current = dropdownCommands

  // 是否有命令历史（决定显示 Terminal 还是 Welcome）
  const hasCommands = history.some((h) => h.input !== '')

  // ==================== showDetail — Action 点击处理 ====================
  const showDetail = async (action: Action) => {
    // Admin 删除
    if (action._delete && isAdminRef.current) {
      const col = action._delete.col || 'title'
      const val = encodeURIComponent(action._delete.title)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY
      const token = getAuthToken()
      fetch(
        `${supabaseUrl}/rest/v1/${action._delete.table}?${col}=eq.${val}`,
        {
          method: 'DELETE',
          headers: {
            apikey: key,
            Authorization: `Bearer ${token}`,
            Prefer: 'return=minimal',
          },
        },
      ).then(() => {
        setDataVersion((v) => v + 1)
      })
      setHistory((prev) => [
        ...prev,
        { input: '', output: `Deleted "${action._delete!.title}"` },
      ])
      return
    }
    // Admin 编辑 News
    if (action._edit && isAdminRef.current) {
      if (action._edit.table === 'rag' && action._edit.id) {
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY
        const url = import.meta.env.VITE_SUPABASE_URL
        fetch(
          `${url}/rest/v1/rag_documents?id=eq.${action._edit.id}&select=title,content`,
          {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
          },
        )
          .then((r) => r.json())
          .then((data) => {
            if (data?.[0]) {
              setKbTitle(data[0].title)
              setKbContent(data[0].content)
              setKbEditId(action._edit!.id!)
              setAdminSection('kb-edit')
            }
          })
        return
      }
      const news = await fetchNews()
      const n = news.find((x) => x.title === action._edit!.title)
      if (n) {
        setNewsEditId(n.title)
        setNewsEditDocId(n.document_id ?? null)
        setNewsTitle(n.title)
        setNewsDetail(n.detail)
        setAdminSection('news-edit')
        return
      }
      return
    }
    // 普通展示详情
    setHistory((prev) => [
      ...prev,
      { input: '', output: action.detail ?? '', image: action.image },
    ])
  }

  // ==================== runCommand — 命令路由 ====================
  const runCommand = async (cmd: string) => {
    const withoutSlash = cmd.startsWith('/') ? cmd.slice(1) : cmd
    const trimmed = withoutSlash.trim()
    if (!trimmed) return

    const [name, ...args] = trimmed.split(/\s+/)
    const lower = name.toLowerCase()

    // ==================== /login /register — 登录/注册 ====================
    if (lower === 'login' || lower === 'register') {
      const [email] = args
      if (!email) {
        setHistory((prev) => [
          ...prev,
          { input: cmd, output: `Usage: /${lower} <email>` },
        ])
        return
      }
      setPasswordMode({ email, mode: lower })
      setRealPassword('')
      setInput('')
      setHistory((prev) => [...prev, { input: cmd, output: 'Password:' }])
      return
    }

    // ==================== /logout — 登出 ====================
    if (lower === 'logout') {
      const supabase = getSupabase()
      if (!supabase) {
        setHistory((prev) => [
          ...prev,
          { input: cmd, output: 'Not logged in.' },
        ])
        return
      }
      setHistory((prev) => [...prev, { input: cmd, output: 'Signing out...' }])
      try {
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY
        const url = import.meta.env.VITE_SUPABASE_URL
        const raw = localStorage.getItem(
          `sb-${new URL(url).hostname.split('.')[0]}-auth-token`,
        )
        const session = raw ? JSON.parse(raw) : null
        const token = session?.access_token
        if (token) {
          await fetch(`${url}/auth/v1/logout`, {
            method: 'POST',
            headers: { apikey: key, Authorization: `Bearer ${token}` },
          })
          localStorage.removeItem(
            `sb-${new URL(url).hostname.split('.')[0]}-auth-token`,
          )
        }
        setHistory((prev) => [...prev, { input: '', output: 'Logged out.' }])
        setTimeout(() => window.location.reload(), 500)
      } catch {
        setHistory((prev) => [
          ...prev,
          { input: '', output: 'Logged out (locally).' },
        ])
      }
      return
    }

    // ==================== /whoami — 查看当前用户 ====================
    if (lower === 'whoami') {
      const u = userRef.current
      if (!u) {
        setHistory((prev) => [
          ...prev,
          { input: cmd, output: 'Not logged in.' },
        ])
      } else {
        setHistory((prev) => [
          ...prev,
          { input: cmd, output: `${u.email}\nID: ${u.id}` },
        ])
      }
      return
    }

    // ==================== /news — 新闻管理 ====================
    if (lower === 'news') {
      const subcmd = args[0]?.toLowerCase()

      // /news delete <title> (admin)
      if (subcmd === 'delete') {
        if (!isAdminRef.current) {
          setHistory((prev) => [...prev, { input: cmd, output: '需要管理员权限。请先登录。' }])
          return
        }
        const title = args.slice(1).join(' ')
        if (!title) {
          setHistory((prev) => [
            ...prev,
            { input: cmd, output: 'Usage: /news delete <title>' },
          ])
          return
        }
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const token = getAuthToken()
        const item = await fetch(
          `${supabaseUrl}/rest/v1/site_news?title=eq.${encodeURIComponent(title)}&select=document_id`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } },
        )
          .then((r) => r.json())
          .then((d) => d?.[0])
        const ok = await fetch(
          `${supabaseUrl}/rest/v1/site_news?title=eq.${encodeURIComponent(title)}`,
          {
            method: 'DELETE',
            headers: {
              apikey: key,
              Authorization: `Bearer ${token}`,
              Prefer: 'return=minimal',
            },
          },
        ).then((r) => r.ok)
        if (ok) {
          if (item?.document_id) deleteDocumentById(item.document_id).then()
          setDataVersion((v) => v + 1)
          setHistory((prev) => [
            ...prev,
            { input: cmd, output: `News "${title}" deleted.` },
          ])
        } else {
          setHistory((prev) => [
            ...prev,
            { input: cmd, output: 'Failed to delete.' },
          ])
        }
        return
      }

      // /news add (admin) — 打开新增表单
      if (subcmd === 'add') {
        if (!isAdminRef.current) {
          setHistory((prev) => [...prev, { input: cmd, output: '需要管理员权限。请先登录。' }])
          return
        }
        setAdminSection('news-add')
        setNewsTitle('')
        setNewsDetail('')
        return
      }

      // /news — 查看新闻列表（走通用 COMMANDS handler）
    }

    // ==================== /about — 关于 (admin edit) ====================
    if (lower === 'about') {
      const subcmd = args[0]?.toLowerCase()

      // /about edit (admin) — 打开编辑表单
      if (subcmd === 'edit') {
        if (!isAdminRef.current) {
          setHistory((prev) => [...prev, { input: cmd, output: '需要管理员权限。请先登录。' }])
          return
        }
        const about = await fetchAbout()
        setAdminSection('about')
        setAdminText(about)
        return
      }

      // /about — 查看关于（走通用 COMMANDS handler）
    }

    // ==================== /skills — 查看 AI Skills ====================
    if (lower === 'skills') {
      // /skills — 打开 skills 列表弹窗
      setSkillModal(true)
      return
    }

    // ==================== /knowledge-base — 知识库管理 ====================
    if (lower === 'knowledge-base') {
      const subcmd = args[0]?.toLowerCase()

      // /knowledge-base upload (admin) — 上传文档
      if (subcmd === 'upload') {
        if (!isAdminRef.current) {
          setHistory((prev) => [...prev, { input: cmd, output: '需要管理员权限。请先登录。' }])
          return
        }
        setAdminSection('kb-upload')
        setKbTitle('')
        setKbContent('')
        return
      }

      // /knowledge-base search <query> — 搜索
      if (subcmd === 'search') {
        const query = args.slice(1).join(' ')
        if (!query) {
          setHistory((prev) => [
            ...prev,
            { input: cmd, output: 'Usage: /knowledge-base search <query>' },
          ])
          return
        }
        setHistory((prev) => [...prev, { input: cmd, output: 'Searching...' }])
        searchDocuments(query, 5)
          .then((docs) => {
            if (!docs.length) {
              setHistory((prev) => [
                ...prev,
                { input: '', output: 'No relevant documents found.' },
              ])
            } else {
              setHistory((prev) => [
                ...prev,
                {
                  input: '',
                  output: docs
                    .map(
                      (d) =>
                        `**${d.title}** (${Math.round(d.similarity * 100)}%)\n${d.content.slice(0, 500)}...`,
                    )
                    .join('\n\n---\n\n'),
                },
              ])
            }
          })
          .catch((e) =>
            setHistory((prev) => [
              ...prev,
              { input: '', output: `Search error: ${e.message}` },
            ]),
          )
        return
      }

      // /knowledge-base delete <id> (admin) — 删除文档
      if (subcmd === 'delete') {
        if (!isAdminRef.current) {
          setHistory((prev) => [...prev, { input: cmd, output: '需要管理员权限。请先登录。' }])
          return
        }
        if (!args[1]) {
          setHistory((prev) => [...prev, { input: cmd, output: 'Usage: /knowledge-base delete <id>' }])
          return
        }
        const id = args[1]
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const token = getAuthToken()
        fetch(`${supabaseUrl}/rest/v1/rag_documents?id=eq.${id}`, {
          method: 'DELETE',
          headers: {
            apikey: key,
            Authorization: `Bearer ${token}`,
            Prefer: 'return=minimal',
          },
        }).then((r) => {
          if (r.ok)
            setHistory((prev) => [
              ...prev,
              { input: '', output: `Document ${id} deleted.` },
            ])
          else
            setHistory((prev) => [
              ...prev,
              { input: '', output: 'Delete failed.' },
            ])
        })
        return
      }

      // /knowledge-base — 查看知识库列表
      setHistory((prev) => [...prev, { input: cmd, output: 'Loading...' }])
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY
      const url = import.meta.env.VITE_SUPABASE_URL
      fetch(
        `${url}/rest/v1/rag_documents?select=id,title,content,source,created_at&order=created_at.desc`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } },
      )
        .then((r) => r.json())
        .then(
          (data: {
            id: number
            title: string
            content: string
            source: string
            created_at: string
          }[]) => {
            if (!data?.length)
              setHistory((prev) => [
                ...prev,
                { input: '', output: 'No documents.' },
              ])
            else
              setHistory((prev) => [
                ...prev,
                {
                  input: '',
                  output: `Documents (${data.length}):`,
                  actions: data.map((d) => ({
                    label: `${d.source ? `[${d.source}] ` : ''}${d.title}`,
                    detail: d.content,
                    inlineActions: [
                      {
                        label: '',
                        _edit: {
                          table: 'rag',
                          title: d.title,
                          id: d.id,
                        },
                      },
                      {
                        label: '',
                        _delete: {
                          table: 'rag_documents',
                          title: String(d.id),
                          col: 'id',
                        },
                      },
                    ],
                  })),
                },
              ])
          },
        )
        .catch(() =>
          setHistory((prev) => [
            ...prev,
            { input: '', output: 'Failed to load.' },
          ]),
        )
      return
    }

    // ==================== /clear — 清屏 ====================
    if (lower === 'clear') {
      setHistory([])
      requestAnimationFrame(() => containerRef.current?.focus())
      return
    }

    // ==================== /update-log — 更新日志时间线 ====================
    if (lower === 'update-log') {
      if (!updatesRef.current.length) {
        setHistory((prev) => [...prev, { input: cmd, output: '暂无可用的更新日志。' }])
        return
      }
      setUpdateLogModal(true)
      return
    }

    // ==================== 通用命令（about, projects, news, contact）====================
    const handler = COMMANDS[lower]
    if (!handler) {
      setHistory((prev) => [
        ...prev,
        {
          input: cmd,
          output: `command not found: /${name}\nType /skills to see available skills.`,
        },
      ])
      return
    }

    const result = await handler(args)
    if (typeof result === 'string') {
      setHistory((prev) => [...prev, { input: cmd, output: result }])
    } else {
      setHistory((prev) => [
        ...prev,
        { input: cmd, output: result.output, actions: result.actions },
      ])
    }
  }

  // ==================== AI 聊天提交 ====================
  const submitChat = async (query: string) => {
    const currentFile = pendingFile
    setInput('')
    setSuggestion('')
    setHistoryIdx(-1)
    setPendingFile(null)

    let fullContent = query
    if (currentFile) {
      fullContent = `[文件: ${currentFile.name}]\n\n${currentFile.content}\n\n---\n用户: ${query}`
    }

    chatHistoryRef.current.push({ role: 'user', content: fullContent })
    const u = userRef.current
    if (u) {
      getSupabase()
        ?.from('chat_messages')
        .insert({ user_id: u.id, role: 'user', content: fullContent })
        .then()
    }

    const userLine: Line = {
      input: query,
      output: '',
      status: 'loading',
      file: currentFile ? { name: currentFile.name, type: currentFile.type } : undefined,
    }
    const aiLine: Line = { input: '', output: '', status: undefined }
    setHistory((prev) => [...prev, userLine, aiLine])

    try {
      const result = await chat(chatHistoryRef.current, {
        email: u?.email,
        userId: u?.id,
        token: getAuthToken(),
        skills: skillsRef.current,
        fallbackTools: TOOLS,
        onStep: (step: ChatStep) => {
          setHistory((prev) => {
            const updated = [...prev]
            for (let i = updated.length - 1; i >= 0; i--) {
              if (
                updated[i].input === '' &&
                updated[i].status === undefined &&
                updated[i].output === ''
              ) {
                const existing = [...(updated[i].steps ?? [])]
                const idx = existing.findIndex(
                  (s) => s.tool === step.tool,
                )
                if (idx >= 0) {
                  existing[idx] = step
                } else {
                  existing.push(step)
                }
                updated[i] = { ...updated[i], steps: existing }
                break
              }
            }
            return updated
          })
        },
      })

      // 标记 loading 行完成
      const markDone = () => {
        setHistory((prev) => {
          const updated = [...prev]
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].status === 'loading') {
              updated[i] = { ...updated[i], status: 'done' }
              break
            }
          }
          return updated
        })
      }

      if (result.stream) {
        let finalText = ''
        await readStream(result.stream, (text) => {
          finalText = text
          setHistory((prev) => {
            const updated = [...prev]
            for (let i = updated.length - 1; i >= 0; i--) {
              if (updated[i].input === '' && !updated[i].status) {
                updated[i] = { ...updated[i], output: text }
                break
              }
            }
            return updated
          })
        })
        setHistory((prev) => {
          const updated = [...prev]
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].input === '' && !updated[i].status) {
              updated[i] = { ...updated[i], status: 'done' }
              break
            }
          }
          return updated
        })
        markDone()
        chatHistoryRef.current.push({ role: 'assistant', content: finalText })
        if (u)
          getSupabase()
            ?.from('chat_messages')
            .insert({ user_id: u.id, role: 'assistant', content: finalText })
            .then()
      } else {
        setHistory((prev) => {
          const updated = [...prev]
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].input === '' && !updated[i].status) {
              updated[i] = {
                ...updated[i],
                output: result.text,
                status: 'done',
              }
              break
            }
          }
          return updated
        })
        markDone()
        chatHistoryRef.current.push({
          role: 'assistant',
          content: result.text,
        })
        if (u)
          getSupabase()
            ?.from('chat_messages')
            .insert({
              user_id: u.id,
              role: 'assistant',
              content: result.text,
            })
            .then()
      }
    } catch {
      setHistory((prev) => {
        const updated = [...prev]
        for (let i = updated.length - 1; i >= 0; i--) {
          if (updated[i].status === 'loading') {
            updated[i] = { ...updated[i], status: 'done' }
            break
          }
        }
        return updated
      })
    }
  }

  // ref — 保持键盘事件中能读到最新的 submitChat（含 pendingFile）
  const submitChatRef = useRef(submitChat)
  submitChatRef.current = submitChat

  // ==================== Enter 键处理 ====================
  const handleEnter = () => {
    const cmds = dropdownRef.current
    const dIdx = dropdownIdxRef.current
    const currentInput = inputRef.current

    // 密码模式
    if (passwordModeRef.current) {
      const pm = passwordModeRef.current
      const pw = realPasswordRef.current
      setHistory((prev) => [
        ...prev,
        {
          input: '',
          output: `${pm.mode === 'login' ? 'Logging in' : 'Registering'}...`,
        },
      ])
      setPasswordMode(null)
      setRealPassword('')
      setInput('')
      const supabase = getSupabase()
      if (!supabase) {
        setHistory((prev) => [
          ...prev,
          { input: '', output: 'Supabase not configured.' },
        ])
        return
      }
      if (pm.mode === 'login') {
        supabase.auth
          .signInWithPassword({ email: pm.email, password: pw })
          .then(({ error }) => {
            if (error)
              setHistory((prev) => [
                ...prev,
                { input: '', output: error.message },
              ])
            else
              setHistory((prev) => [
                ...prev,
                { input: '', output: 'Logged in successfully!' },
              ])
          })
      } else {
        supabase.auth
          .signUp({ email: pm.email, password: pw })
          .then(({ error }) => {
            if (error)
              setHistory((prev) => [
                ...prev,
                { input: '', output: error.message },
              ])
            else
              setHistory((prev) => [
                ...prev,
                {
                  input: '',
                  output: 'Account created! Check your email to confirm.',
                },
              ])
          })
      }
      return
    }

    // 下拉选择
    if (cmds.length > 0 && dIdx >= 0) {
      if (currentInput.slice(1) === cmds[dIdx]) {
        runCommand(currentInput)
        setInput('')
        setSuggestion('')
        setDropdownIdx(-1)
        setHoverIdx(-1)
        setHistoryIdx(-1)
      } else {
        setInput('/' + cmds[dIdx] + ' ')
        setDropdownIdx(-1)
        setHoverIdx(-1)
      }
      return
    }

    // 唯一匹配
    if (cmds.length === 1) {
      if (currentInput.slice(1) === cmds[0]) {
        runCommand(currentInput)
        setInput('')
        setSuggestion('')
        setDropdownIdx(-1)
        setHoverIdx(-1)
        setHistoryIdx(-1)
      } else {
        setInput('/' + cmds[0] + ' ')
        setDropdownIdx(-1)
        setHoverIdx(-1)
      }
      return
    }

    // AI 聊天
    if (!currentInput.startsWith('/')) {
      if (!currentInput.trim()) return
      submitChatRef.current(currentInput)
      return
    }

    // 命令行
    runCommand(currentInput)
    setInput('')
    setSuggestion('')
    setDropdownIdx(-1)
    setHoverIdx(-1)
    setHistoryIdx(-1)
  }

  // ==================== 键盘事件处理 ====================
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return

      // Escape — 优先处理，可关闭弹窗
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (updateLogModalRef.current) {
          setUpdateLogModal(false)
          return
        }
        if (passwordModeRef.current) {
          setPasswordMode(null)
          setRealPassword('')
        }
        setDropdownIdx(-1)
        setHoverIdx(-1)
        return
      }

      if (adminSectionRef.current || updateLogModalRef.current) return

      // Shift+Enter / Ctrl+Enter / Meta+Enter — 换行
      if (e.key === 'Enter' && (e.shiftKey || e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        e.stopPropagation()
        setInput((v) => v + '\n')
        return
      }

      // Enter — 提交
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        handleEnter()
        return
      }

      // Tab — 自动补全
      if (e.key === 'Tab') {
        e.preventDefault()
        e.stopPropagation()
        const cmds = dropdownRef.current
        const dIdx = dropdownIdxRef.current
        const selected =
          cmds.length > 0 && dIdx >= 0 ? cmds[dIdx] : cmds[0]
        if (selected) {
          setInput('/' + selected + ' ')
          setDropdownIdx(-1)
          setHoverIdx(-1)
        }
        return
      }

      // ArrowUp — 下拉导航 or 历史导航
      if (e.key === 'ArrowUp' && dropdownRef.current.length > 0) {
        e.preventDefault()
        e.stopPropagation()
        const cmds = dropdownRef.current
        const dIdx = dropdownIdxRef.current
        const idx = dIdx <= 0 ? cmds.length - 1 : dIdx - 1
        setDropdownIdx(idx)
        setHoverIdx(-1)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        const entries = historyRef.current
          .filter((h) => h.input)
          .map((h) => h.input)
        if (entries.length === 0) return
        const hIdx = historyIdxRef.current
        const nextIdx =
          hIdx === -1 ? entries.length - 1 : Math.max(0, hIdx - 1)
        setHistoryIdx(nextIdx)
        setInput(entries[nextIdx])
        return
      }

      // ArrowDown — 下拉导航 or 历史导航
      if (e.key === 'ArrowDown' && dropdownRef.current.length > 0) {
        e.preventDefault()
        e.stopPropagation()
        const cmds = dropdownRef.current
        const dIdx = dropdownIdxRef.current
        const idx = dIdx >= cmds.length - 1 ? 0 : dIdx + 1
        setDropdownIdx(idx)
        setHoverIdx(-1)
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        const entries = historyRef.current
          .filter((h) => h.input)
          .map((h) => h.input)
        if (entries.length === 0) return
        const hIdx = historyIdxRef.current
        if (hIdx === -1) return
        const nextIdx = hIdx + 1
        if (nextIdx >= entries.length) {
          setHistoryIdx(-1)
          setInput('')
        } else {
          setHistoryIdx(nextIdx)
          setInput(entries[nextIdx])
        }
        return
      }

      // ArrowRight — 接受建议
      if (e.key === 'ArrowRight' && suggestionRef.current) {
        e.preventDefault()
        e.stopPropagation()
        setInput(suggestionRef.current + ' ')
        return
      }

      // 密码模式 — 处理普通按键
      if (passwordModeRef.current) {
        const handled = handlePasswordKey(
          e.key,
          e.ctrlKey,
          e.metaKey,
          e.altKey,
        )
        if (handled) {
          e.preventDefault()
          e.stopPropagation()
          // 密码字符显示为圆点
          if (e.key !== 'Backspace') {
            setInput((v) => v + '\u2022')
          } else {
            setInput((v) => v.slice(0, -1))
          }
        }
        return
      }
    }

    el.addEventListener('keydown', onKeyDown)
    return () => el.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ==================== 渲染 ====================
  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="h-svh flex flex-col outline-none"
      style={{ background: 'var(--ui-bg)' }}
    >
      <a
        href="https://github.com/gengxiankun/ai.sh"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-4 right-4 sm:top-5 sm:right-5 z-10 p-2 rounded-lg transition-colors hover:bg-white/10"
        style={{ color: 'var(--ui-text-secondary)' }}
        title="GitHub"
        aria-label="GitHub"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.605-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z" />
        </svg>
      </a>
      {hasCommands ? (
        <Terminal
          history={history}
          input={input}
          dropdownCommands={dropdownCommands}
          commandDescriptions={COMMAND_DESCRIPTIONS}
          dropdownIdx={dropdownIdx}
          hoverIdx={hoverIdx}
          passwordMode={!!passwordMode}
          user={user}
          isAdmin={isAdmin}
          skills={skills}
          modelInfo={modelInfo}
          pendingFile={pendingFile}
          textareaRef={textareaRef}
          bottomRef={bottomRef}
          onInputChange={(v) => {
            setInput(v)
            setHistoryIdx(-1)
          }}
          onInputResize={(el) => {
            el.style.height = 'auto'
            el.style.height = Math.min(el.scrollHeight, 22 * 20) + 'px'
          }}
          onDropdownHover={setHoverIdx}
          onDropdownLeave={() => setHoverIdx(-1)}
          onDropdownSelect={(cmd) => {
            setInput('/' + cmd + ' ')
            setDropdownIdx(-1)
            setHoverIdx(-1)
          }}
          onActionClick={showDetail}
          onGuestClick={() => {
            setInput('我想注册或登录账号')
            setHistoryIdx(-1)
          }}
          onFileSelect={setPendingFile}
          onFileRemove={() => setPendingFile(null)}
        />
      ) : (
        <Welcome
          input={input}
          suggestions={suggestions}
          updates={updates}
          dropdownCommands={dropdownCommands}
          commandDescriptions={COMMAND_DESCRIPTIONS}
          dropdownIdx={dropdownIdx}
          hoverIdx={hoverIdx}
          passwordMode={!!passwordMode}
          user={user}
          isAdmin={isAdmin}
          skills={skills}
          modelInfo={modelInfo}
          pendingFile={pendingFile}
          textareaRef={textareaRef}
          onInputChange={(v) => {
            setInput(v)
            setHistoryIdx(-1)
          }}
          onInputResize={(el) => {
            el.style.height = 'auto'
            el.style.height = Math.min(el.scrollHeight, 22 * 20) + 'px'
          }}
          onDropdownHover={setHoverIdx}
          onDropdownLeave={() => setHoverIdx(-1)}
          onDropdownSelect={(cmd) => {
            setInput('/' + cmd + ' ')
            setDropdownIdx(-1)
            setHoverIdx(-1)
          }}
          onGuestClick={() => {
            setInput('我想注册或登录账号')
            setHistoryIdx(-1)
          }}
          onOpenUpdateLog={() => setUpdateLogModal(true)}
          onFileSelect={setPendingFile}
          onFileRemove={() => setPendingFile(null)}
        />
      )}

      {/* ============ Admin 弹层 ============ */}
      {adminSection === 'about' && (
        <AboutEdit
          currentContent={adminText}
          onClose={() => setAdminSection(null)}
          onSaved={() => setDataVersion((v) => v + 1)}
        />
      )}

      {(adminSection === 'news-add' || adminSection === 'news-edit') && (
        <NewsForm
          mode={adminSection === 'news-add' ? 'add' : 'edit'}
          initialTitle={newsTitle}
          initialDetail={newsDetail}
          editId={newsEditId || undefined}
          editDocId={newsEditDocId}
          onClose={() => {
            setAdminSection(null)
            setNewsEditDocId(null)
          }}
          onSaved={() => setDataVersion((v) => v + 1)}
        />
      )}

      {(adminSection === 'kb-upload' || adminSection === 'kb-edit') && (
        <KBForm
          mode={adminSection === 'kb-upload' ? 'upload' : 'edit'}
          initialTitle={kbTitle}
          initialContent={kbContent}
          editId={kbEditId}
          onClose={() => {
            setAdminSection(null)
            setKbEditId(null)
          }}
          onSaved={(message) => {
            setHistory((prev) => [...prev, { input: '', output: message }])
          }}
        />
      )}

      {skillModal && (
        <SkillsList
          skills={skills}
          onClose={() => setSkillModal(false)}
        />
      )}

      {updateLogModal && (
        <UpdateLogModal
          updates={updates}
          onClose={() => setUpdateLogModal(false)}
        />
      )}

    </div>
  )
}
