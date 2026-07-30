// 应用根组件 — 编排层
// 管理会话、终端逻辑、命令路由、Admin 弹层、Skill 弹层
// UI 渲染全部委托给 components/ 下的各子组件

import { useState, useRef, useEffect } from 'react'
import { getSupabase } from './lib/supabase'
import { chat, readStream } from './lib/chat'
import { TOOLS } from './store/commands'
import { fetchPosts, fetchCategories, fetchTags } from './store/api'
import { fetchSkills } from './lib/skills/index'
import {
  searchDocuments,
  deleteDocumentById,
} from './lib/rag'
import { useAuth } from './hooks/useAuth'
import { getAuthToken } from './lib/api'
import { verifyInvite, consumeInvite, listInvites } from './lib/invite'
import { Terminal } from './components/Terminal'
import { Welcome } from './components/Welcome'
import { PostForm } from './components/modals/PostForm'
import { KBForm } from './components/modals/KBForm'
import { InviteForm } from './components/modals/InviteForm'
import type {
  Action,
  Line,
  CommandResult,
  ChatStep,
  Skill,
  PendingFile,
} from './types'
import './App.css'

// 终端命令处理 — 返回字符串或 { output, actions }
const COMMANDS: Record<string, (args: string[]) => Promise<CommandResult>> = {
  posts: async () => {
    const [posts, categories, tags] = await Promise.all([
      fetchPosts(),
      fetchCategories(),
      fetchTags(),
    ])
    const catMap = new Map(categories.map((c) => [c.id, c.name]))
    const tagMap = new Map(tags.map((t) => [t.id, t.name]))

    // 批量获取所有 post_tags
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    const ptData: { post_id: number; tag_id: number }[] = await fetch(
      `${supabaseUrl}/rest/v1/site_post_tags?select=post_id,tag_id`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    ).then((r) => r.json()).catch(() => [])

    const postTags = new Map<number, number[]>()
    for (const pt of ptData ?? []) {
      const list = postTags.get(pt.post_id) ?? []
      list.push(pt.tag_id)
      postTags.set(pt.post_id, list)
    }

    if (!posts.length) return '暂无文章。'

    return {
      output: `共 ${posts.length} 篇`,
      actions: posts.map((p) => {
        const catName = p.category_id ? catMap.get(p.category_id) : undefined
        const tagIds = postTags.get(p.id) ?? []
        const tagNames = tagIds.map((tid) => tagMap.get(tid)).filter(Boolean) as string[]
        return {
          label: p.title,
          category: catName,
          tags: tagNames.length > 0 ? tagNames : undefined,
          detail: p.detail,
          inlineActions: [
            { label: '', _edit: { table: 'site_posts', title: p.title, id: p.id } },
            { label: '', _delete: { table: 'site_posts', title: p.title } },
          ],
        }
      }),
    }
  },
}

// 命令描述 — 用于 autocomplete dropdown 提示
const COMMAND_DESCRIPTIONS: Record<string, string> = {
  register: '注册',
  login: '登录',
  logout: '登出',
  posts: '帖子',
  'knowledge-base': '知识库',
  'invite-code': '邀请码',
}

// 子命令（在下拉列表中可见）
const VISIBLE_SUBCOMMANDS = [
  'invite-code add',
  'invite-code verify',
  'posts add',
  'knowledge-base search',
  'knowledge-base delete',
]

// 仅管理员可见的子命令
const ADMIN_SUBCOMMANDS: string[] = [
  'invite-code add',
  'posts add',
  'knowledge-base delete',
]

// 子命令描述
const SUBCOMMAND_DESCRIPTIONS: Record<string, string> = {
  'invite-code add': '创建邀请码',
  'invite-code verify': '验证邀请码',
  'posts add': '创建帖子',
  'knowledge-base search': '搜索知识库',
}

// 所有可用命令（含系统命令）
const ALL_COMMANDS = [
  'register',
  'login',
  'logout',
  'knowledge-base',
  'invite-code',
  ...Object.keys(COMMANDS),
  ...VISIBLE_SUBCOMMANDS,
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

  // 根据登录状态和权限过滤可见命令
  const loggedIn = !!user
  const allDescriptions = { ...COMMAND_DESCRIPTIONS, ...SUBCOMMAND_DESCRIPTIONS }
  const visibleCommands = ALL_COMMANDS.filter((cmd) => {
    if (loggedIn && (cmd === 'login' || cmd === 'register')) return false
    if (!loggedIn && cmd === 'logout') return false
    if (!isAdmin && ADMIN_SUBCOMMANDS.includes(cmd)) return false
    return true
  })

  // ==================== 终端状态 ====================
  const [history, setHistory] = useState<Line[]>([
    { input: '', output: 'Welcome to ai.sh' },
  ])
  const [input, setInput] = useState('')
  const [suggestion, setSuggestion] = useState('')
  const [dropdownIdx, setDropdownIdx] = useState(-1)
  const [hoverIdx, setHoverIdx] = useState(-1)
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [_dataVersion, setDataVersion] = useState(0)

  // Skill 状态
  const [skills, setSkills] = useState<Skill[]>([])
  const skillsRef = useRef<Skill[]>([])
  // 模型信息（从 Edge Function 获取）
  const [modelInfo, setModelInfo] = useState<{ provider: string; model: string } | null>(null)

  // 待上传文件
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null)

  // 邀请码状态
  const [inviteToken, setInviteToken] = useState(() => localStorage.getItem('invite_token') || '')
  const [inviteChecked, setInviteChecked] = useState(false)
  const [inviteInfo, setInviteInfo] = useState<{ used: number; quota: number } | null>(null)
  const [showInviteForm, setShowInviteForm] = useState<'create' | 'verify' | 'edit' | null>(null)
  const [inviteEditId, setInviteEditId] = useState<number | null>(null)
  const [inviteEditDesc, setInviteEditDesc] = useState('')
  const [inviteEditQuota, setInviteEditQuota] = useState(5000)
  const [inviteEditToken, setInviteEditToken] = useState('')
  const [inviteEditDays, setInviteEditDays] = useState(7)
  const inviteTokenRef = useRef(inviteToken)
  const showInviteFormRef = useRef(showInviteForm)
  inviteTokenRef.current = inviteToken
  showInviteFormRef.current = showInviteForm

  skillsRef.current = skills

  // Admin 弹层状态
  const [adminSection, setAdminSection] = useState<string | null>(null)
  const [postTitle, setPostTitle] = useState('')
  const [postDetail, setPostDetail] = useState('')
  const [postEditDocId, setPostEditDocId] = useState<number | null>(null)
  const [kbTitle, setKbTitle] = useState('')
  const [kbContent, setKbContent] = useState('')
  const [kbEditId, setKbEditId] = useState<number | null>(null)
  const [postEditId, setPostEditId] = useState('')
  const adminSectionRef = useRef<string | null>(null)
  adminSectionRef.current = adminSection

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
      if (adminSectionRef.current || showInviteFormRef.current) return
      const inp = el.querySelector('input')
      if (inp && document.activeElement !== inp) inp.focus()
    }
    el.addEventListener('click', cb)
    return () => el.removeEventListener('click', cb)
  }, [])

  // 检测 URL 中的邀请码
  useEffect(() => {
    if (inviteChecked) return
    const p = new URLSearchParams(window.location.search)
    const urlToken = p.get('invite')
    if (!urlToken) { setInviteChecked(true); return }
    verifyInvite(urlToken).then((inv) => {
      if (inv) {
        localStorage.setItem('invite_token', urlToken)
        setInviteToken(urlToken)
        // 清理 URL 参数
        const u = new URL(window.location.href)
        u.searchParams.delete('invite')
        window.history.replaceState({}, '', u.toString())
      }
      setInviteChecked(true)
    }).catch(() => setInviteChecked(true))
  }, [])

  // 刷新邀请码用量
  useEffect(() => {
    if (!inviteToken) { setInviteInfo(null); return }
    const refresh = () => verifyInvite(inviteToken).then((inv) => {
      if (inv) setInviteInfo({ used: inv.token_used, quota: inv.token_quota })
      else { setInviteInfo(null); localStorage.removeItem('invite_token'); setInviteToken('') }
    }).catch(() => {})
    refresh()
    const id = setInterval(refresh, 10000)
    return () => clearInterval(id)
  }, [inviteToken])

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
      const query = input.slice(1).toLowerCase()
      const hasSpace = input.includes(' ')
      const match = visibleCommands.find((n) => {
        if (hasSpace ? !n.includes(' ') : n.includes(' ')) return false
        return n.startsWith(query) && n !== query
      })
      setSuggestion(match ? '/' + match : '')
    } else {
      setSuggestion('')
    }
    setDropdownIdx(-1)
    setHoverIdx(-1)
  }, [input])

  // 当前下拉候选命令（有空格时只显示子命令）
  const dropdownCommands = input.startsWith('/')
    ? visibleCommands.filter((n) => {
        const hasSpace = input.includes(' ')
        if (hasSpace) return n.includes(' ') && n.startsWith(input.slice(1).toLowerCase())
        return !n.includes(' ') && n.startsWith(input.slice(1).toLowerCase())
      })
    : []

  dropdownRef.current = dropdownCommands

  // 是否有命令历史（决定显示 Terminal 还是 Welcome）
  const hasCommands = history.some((h) => h.input !== '')

  // ==================== showDetail — Action 点击处理 ====================
  const showDetail = async (action: Action) => {
    // 复制
    if (action._copy) {
      await navigator.clipboard.writeText(action._copy)
      setHistory((prev) => [...prev, { input: '', output: '已复制到剪贴板' }])
      return
    }
    // Admin 删除
    if (action._delete && isAdminRef.current) {
      const col = action._delete.col || 'title'
      const val = encodeURIComponent(action._delete.title)
      const table = action._delete.table
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY
      const token = getAuthToken()

      // 删除 post 时同步删除关联的 RAG 文档
      if (table === 'site_posts') {
        const item = await fetch(
          `${supabaseUrl}/rest/v1/site_posts?${col}=eq.${val}&select=document_id`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } },
        )
          .then((r) => r.json())
          .then((d) => d?.[0])
        if (item?.document_id) deleteDocumentById(item.document_id).then()
      }

      fetch(
        `${supabaseUrl}/rest/v1/${table}?${col}=eq.${val}`,
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
    // Admin 编辑 Invite
    if (action._edit && isAdminRef.current && action._edit.table === 'invite_codes') {
      const item = await listInvites().then((list) => list.find((inv) => inv.id === action._edit!.id))
      if (item) {
        const remainingDays = Math.max(1, Math.ceil((new Date(item.expires_at).getTime() - Date.now()) / 86400000))
        setInviteEditId(item.id)
        setInviteEditDesc(item.description || '')
        setInviteEditQuota(item.token_quota)
        setInviteEditToken(item.token)
        setInviteEditDays(remainingDays)
        setShowInviteForm(null) // reset first
        setTimeout(() => setShowInviteForm('edit'), 0)
      }
      return
    }
    // Admin 编辑 Post
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
      const posts = await fetchPosts()
      const p = posts.find((x) => x.title === action._edit!.title)
      if (p) {
        setPostEditId(String(p.id))
        setPostEditDocId(p.document_id ?? null)
        setPostTitle(p.title)
        setPostDetail(p.detail)
        setAdminSection('post-edit')
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

    // ==================== /posts — 文章管理 ====================
    if (lower === 'posts') {
      const subcmd = args[0]?.toLowerCase()

      // /posts delete <title> (admin)
      if (subcmd === 'delete') {
        if (!isAdminRef.current) {
          setHistory((prev) => [...prev, { input: cmd, output: '需要管理员权限。请先登录。' }])
          return
        }
        const title = args.slice(1).join(' ')
        if (!title) {
          setHistory((prev) => [
            ...prev,
            { input: cmd, output: 'Usage: /posts delete <title>' },
          ])
          return
        }
        const key = import.meta.env.VITE_SUPABASE_ANON_KEY
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
        const token = getAuthToken()
        const item = await fetch(
          `${supabaseUrl}/rest/v1/site_posts?title=eq.${encodeURIComponent(title)}&select=id,document_id`,
          { headers: { apikey: key, Authorization: `Bearer ${key}` } },
        )
          .then((r) => r.json())
          .then((d) => d?.[0])
        const ok = await fetch(
          `${supabaseUrl}/rest/v1/site_posts?title=eq.${encodeURIComponent(title)}`,
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
            { input: cmd, output: `Post "${title}" deleted.` },
          ])
        } else {
          setHistory((prev) => [
            ...prev,
            { input: cmd, output: 'Failed to delete.' },
          ])
        }
        return
      }

      // /posts add (admin) — 打开新增表单
      if (subcmd === 'add') {
        if (!isAdminRef.current) {
          setHistory((prev) => [...prev, { input: cmd, output: '需要管理员权限。请先登录。' }])
          return
        }
        setAdminSection('post-add')
        setPostTitle('')
        setPostDetail('')
        return
      }

      // /posts — 查看文章列表（走通用 COMMANDS handler）
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

    // ==================== /invite-code — 邀请码管理 ====================
    if (lower === 'invite-code') {
      const subcmd = args[0]?.toLowerCase()

      // /invite add (admin)
      if (subcmd === 'add') {
        if (!isAdminRef.current) {
          setHistory((prev) => [...prev, { input: cmd, output: '需要管理员权限。' }])
          return
        }
        setShowInviteForm('create')
        return
      }

      // /invite — 显示列表（默认）
      if (!subcmd) {
        if (!isAdminRef.current) {
          setHistory((prev) => [...prev, { input: cmd, output: '需要管理员权限。' }])
          return
        }
        const list = await listInvites()
        if (!list.length) {
          setHistory((prev) => [...prev, { input: cmd, output: '暂无邀请码。\n使用 /invite-code add 创建新的邀请码。' }])
          return
        }
        setHistory((prev) => [
          ...prev,
          {
            input: cmd,
            output: `共 ${list.length} 个邀请码`,
            actions: list.map((inv) => ({
              label: inv.description || inv.token,
              description: `${inv.token} · ${inv.token_used.toLocaleString()}/${inv.token_quota.toLocaleString()} 词元 · ${new Date(inv.expires_at).toLocaleDateString()} 到期`,
              inlineActions: [
                { label: '', _copy: `${window.location.origin}${window.location.pathname}?invite=${inv.token}` },
                { label: '', _edit: { table: 'invite_codes', title: inv.token, id: inv.id } },
                { label: '', _delete: { table: 'invite_codes', title: inv.token, col: 'token' } },
              ],
            })),
          },
        ])
        return
      }

      // /invite verify — 验证邀请码
      if (subcmd === 'verify') {
        setShowInviteForm('verify')
        return
      }

      setHistory((prev) => [...prev, { input: cmd, output: `/invite-code add — 创建新的邀请码` }])
      return
    }

    // ==================== 通用命令（about, posts）====================
    const handler = COMMANDS[lower]
    if (!handler) {
      setHistory((prev) => [
        ...prev,
        {
          input: cmd,
          output: `command not found: /${name}`,
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
                // 推理步骤每次追加，工具调用步骤按 tool 去重
                if (step.status === 'reasoning') {
                  existing.push(step)
                } else {
                  const idx = existing.findIndex(
                    (s) => s.tool === step.tool,
                  )
                  if (idx >= 0) {
                    existing[idx] = step
                  } else {
                    existing.push(step)
                  }
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
        const { usage: streamUsage } = await readStream(result.stream, (text) => {
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
        // 消耗邀请码词元（agent 轮次 + streaming）
        const totalUsage = (result.usage || 0) + (streamUsage || 0)
        if (!isAdminRef.current && inviteTokenRef.current && totalUsage) {
          consumeInvite(inviteTokenRef.current, totalUsage)
        }
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
        // 消耗邀请码词元
        if (!isAdminRef.current && inviteTokenRef.current && result.usage) {
          consumeInvite(inviteTokenRef.current, result.usage)
        }
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
      // 邀请码检查：管理员直接放行，其他人需验证
      if (!isAdminRef.current && !inviteTokenRef.current) {
        setHistory((prev) => [...prev, { input: currentInput, output: '使用邀请码后才能进行 AI 聊天。\n请输入邀请码：/invite-code verify' }])
        setInput('')
        return
      }
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
        if (passwordModeRef.current) {
          setPasswordMode(null)
          setRealPassword('')
        }
        setDropdownIdx(-1)
        setHoverIdx(-1)
        return
      }

      if (adminSectionRef.current) return

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
          commandDescriptions={allDescriptions}
          dropdownIdx={dropdownIdx}
          hoverIdx={hoverIdx}
          passwordMode={!!passwordMode}
          user={user}
          isAdmin={isAdmin}
          skills={skills}
          modelInfo={modelInfo}
          inviteInfo={inviteInfo}
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
          dropdownCommands={dropdownCommands}
          commandDescriptions={allDescriptions}
          dropdownIdx={dropdownIdx}
          hoverIdx={hoverIdx}
          passwordMode={!!passwordMode}
          user={user}
          isAdmin={isAdmin}
          skills={skills}
          modelInfo={modelInfo}
          inviteInfo={inviteInfo}
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
          onFileSelect={setPendingFile}
          onFileRemove={() => setPendingFile(null)}
        />
      )}

      {/* ============ Admin 弹层 ============ */}
      {(adminSection === 'post-add' || adminSection === 'post-edit') && (
        <PostForm
          mode={adminSection === 'post-add' ? 'add' : 'edit'}
          initialTitle={postTitle}
          initialDetail={postDetail}
          editId={postEditId || undefined}
          editDocId={postEditDocId}
          onClose={() => {
            setAdminSection(null)
            setPostEditDocId(null)
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

      {/* InviteForm */}
      {showInviteForm && (
        <InviteForm
          mode={showInviteForm}
          onClose={() => { setShowInviteForm(null); setInviteEditId(null) }}
          onVerified={(token) => {
            setInviteToken(token)
            setShowInviteForm(null)
          }}
          onSaved={() => setDataVersion((v) => v + 1)}
          initialDescription={inviteEditDesc}
          initialQuota={inviteEditQuota}
          initialDays={inviteEditDays}
          editId={inviteEditId ?? undefined}
          editToken={inviteEditToken}
        />
      )}

    </div>
  )
}
