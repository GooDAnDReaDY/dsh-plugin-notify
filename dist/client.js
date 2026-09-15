window.__ModuleLoader__.load({
  id: '@goodandready-private/dsh-plugin-notify',
  factory: (require) => {
    var module = { exports: {} }
    const React = require('react')
    const NS = '@goodandready-private/dsh-plugin-notify'
    const CHANNELS = ['feishu', 'wecom', 'dingtalk', 'slack', 'discord', 'custom']

    const en = {
      title: 'Notify',
      subtitle: 'IM webhook notifications for turn done / error / approval',
      intro: 'Store each webhook URL under Settings → Credentials, then type only the credential name below. Do not paste URLs into this form.',
      'field.feishu': 'Feishu credential',
      'field.wecom': 'WeCom credential',
      'field.dingtalk': 'DingTalk credential',
      'field.slack': 'Slack credential',
      'field.discord': 'Discord credential',
      'field.custom': 'Custom webhook credential',
      'field.events': 'Events (comma-separated)',
      'field.local': 'Local macOS notification',
      'field.timeoutMs': 'Webhook timeout (ms)',
      'field.dndStart': 'DND start (HH:MM)',
      'field.dndEnd': 'DND end (HH:MM)',
      'field.includeSession': 'Include session id',
      'field.includeDuration': 'Include duration',
      'field.excludePrefixes': 'Exclude session prefixes (comma-separated)',
      'hint.cred': 'Credential name only — value must be the full webhook URL.',
      'hint.events': 'task_done, error, approval_requested',
      'settings.loading': 'Loading settings…',
      'settings.unavailable': 'Settings scope unavailable for this plugin.',
      'settings.save': 'Save',
      'settings.saving': 'Saving…',
      'settings.saved': 'Saved',
      'settings.saveFailed': 'Save failed: ',
    }
    const zh = {
      title: '通知',
      subtitle: '在任务完成、出错或需要审批时发送 IM Webhook 通知',
      intro: '请先在设置 → 凭据中保存 Webhook URL，然后只在下方填写凭据名称。不要直接粘贴 URL。',
      'field.feishu': '飞书凭据',
      'field.wecom': '企业微信凭据',
      'field.dingtalk': '钉钉凭据',
      'field.slack': 'Slack 凭据',
      'field.discord': 'Discord 凭据',
      'field.custom': '自定义 Webhook 凭据',
      'field.events': '事件（逗号分隔）',
      'field.local': '本地 macOS 通知',
      'field.timeoutMs': 'Webhook 超时（毫秒）',
      'field.dndStart': '免打扰开始时间（HH:MM）',
      'field.dndEnd': '免打扰结束时间（HH:MM）',
      'field.includeSession': '包含会话 ID',
      'field.includeDuration': '包含持续时间',
      'field.excludePrefixes': '排除会话前缀（逗号分隔）',
      'hint.cred': '仅填写凭据名称；其值必须是完整的 Webhook URL。',
      'hint.events': 'task_done, error, approval_requested',
      'settings.loading': '正在加载设置…',
      'settings.unavailable': '此插件的设置范围不可用。',
      'settings.save': '保存',
      'settings.saving': '正在保存…',
      'settings.saved': '已保存',
      'settings.saveFailed': '保存失败：',
    }

    let ChevronIcon = null
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
      ChevronIcon = primitives && primitives.IconChevronDownOutline14
    } catch (_) {
      ChevronIcon = null
    }

    function FallbackChevron(props) {
      return React.createElement('svg', {
        className: 'pn-chev' + (props.open ? ' pn-chev-open' : ''),
        style: { marginLeft: 'auto', flex: 'none', color: 'var(--dsw-alias-label-tertiary)', transition: 'transform .16s', transform: props.open ? 'rotate(180deg)' : 'none' },
        width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', 'aria-hidden': 'true',
      }, React.createElement('path', {
        d: 'M3.5 5.25L7 8.75L10.5 5.25', stroke: 'currentColor', strokeWidth: 1.5,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }))
    }
    const Chevron = ChevronIcon || FallbackChevron

    const cardCss = [
      '.pn-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none}',
      '.pn-head{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;display:flex;align-items:center;gap:12px;padding:14px 16px}',
      '.pn-title{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}',
      '.pn-sub{color:var(--dsw-alias-label-secondary);font-size:13px}',
      '.pn-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}',
      '.pn-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}',
      '.pn-label{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500}',
      '.pn-hint{color:var(--dsw-alias-label-secondary);font-size:12px}',
      '.pn-input{height:34px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px}',
      '.pn-foot{border-top:1px solid var(--dsw-alias-border-l2);display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px}',
      '.pn-save{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}',
      '.pn-msg-ok{color:var(--dsw-alias-state-success-primary);font-size:12px}',
      '.pn-msg-err{color:var(--dsw-alias-state-danger-primary,#e53935);font-size:12px}',
      '.pn-chev{margin-left:auto;flex:none;color:var(--dsw-alias-label-tertiary);transition:transform .16s}',
      '.pn-chev-open{transform:rotate(180deg)}',
    ].join('')

    function ensureStyles() {
      if (typeof document === 'undefined') return
      if (document.getElementById('dsh-plugin-notify-card-styles')) return
      const el = document.createElement('style')
      el.id = 'dsh-plugin-notify-card-styles'
      el.textContent = cardCss
      document.head.appendChild(el)
    }

    function makeT(dict, fallback) {
      return function t(key) {
        return (dict && dict[key]) || (fallback && fallback[key]) || key
      }
    }

    function useActiveLocale(ctx) {
      return React.useSyncExternalStore(
        React.useMemo(() => (cb) => (ctx && ctx.locale ? ctx.locale.subscribe(cb) : () => {}), [ctx]),
        React.useCallback(() => (ctx && ctx.locale && ctx.locale.getSnapshot ? ctx.locale.getSnapshot().active : 'en'), [ctx]),
        React.useCallback(() => 'en', []),
      )
    }

    function splitList(s) {
      return String(s || '').split(',').map((x) => x.trim()).filter(Boolean)
    }

    function NotifyCard(props) {
      const ctx = props.ctx
      const locale = useActiveLocale(ctx)
      const t = props.t || makeT(locale === 'zh' ? zh : en, en)
      const [open, setOpen] = React.useState(false)
      const [draft, setDraft] = React.useState(null)
      const [saving, setSaving] = React.useState(false)
      const [err, setErr] = React.useState('')
      const [saved, setSaved] = React.useState(false)

      const scope = React.useMemo(
        () => (ctx && ctx.settingsScope ? ctx.settingsScope.bind({ namespace: NS }) : undefined),
        [ctx],
      )
      const snapshot = React.useSyncExternalStore(
        React.useMemo(() => (cb) => (scope ? scope.subscribe(cb) : () => {}), [scope]),
        React.useCallback(() => (scope ? scope.getSnapshot() : { status: 'loading' }), [scope]),
        React.useCallback(() => ({ status: 'loading' }), []),
      )

      React.useEffect(() => { ensureStyles() }, [])

      const status = (snapshot && snapshot.status) || 'loading'
      const stored = (snapshot && snapshot.value) || {}

      React.useEffect(() => {
        if (status === 'ready' && draft === null) {
          const wh = stored.webhooks || {}
          setDraft({
            feishu: wh.feishu || '',
            wecom: wh.wecom || '',
            dingtalk: wh.dingtalk || '',
            slack: wh.slack || '',
            discord: wh.discord || '',
            custom: wh.custom || '',
            events: Array.isArray(stored.events) ? stored.events.join(', ') : 'task_done, error, approval_requested',
            local: stored.local !== false,
            timeoutMs: String(stored.timeoutMs != null ? stored.timeoutMs : 5000),
            dndStart: (stored.dnd && stored.dnd.start) || '',
            dndEnd: (stored.dnd && stored.dnd.end) || '',
            includeSession: stored.includeSession !== false,
            includeDuration: stored.includeDuration !== false,
            excludePrefixes: Array.isArray(stored.excludeSessionPrefixes) ? stored.excludeSessionPrefixes.join(', ') : '',
          })
        }
      }, [status, stored, draft])

      const save = async () => {
        if (!scope || !draft) return
        setSaving(true); setErr(''); setSaved(false)
        const broken = []
        const webhooks = {}
        for (const ch of CHANNELS) webhooks[ch] = String(draft[ch] || '').trim()
        const timeoutNum = Number(String(draft.timeoutMs).trim())
        const payload = {
          webhooks,
          events: splitList(draft.events),
          local: !!draft.local,
          timeoutMs: Number.isFinite(timeoutNum) && timeoutNum > 0 ? timeoutNum : 5000,
          dnd: { start: String(draft.dndStart || '').trim(), end: String(draft.dndEnd || '').trim() },
          includeSession: !!draft.includeSession,
          includeDuration: !!draft.includeDuration,
          excludeSessionPrefixes: splitList(draft.excludePrefixes),
        }
        for (const [k, v] of Object.entries(payload)) {
          try { await scope.set(k, v) }
          catch (e) { broken.push(k + ': ' + (e && e.message || String(e))) }
        }
        setSaving(false)
        if (broken.length) { setErr(t('settings.saveFailed') + broken.join('; ')); return }
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      }

      const field = (key, input) => React.createElement('div', { className: 'pn-field' },
        React.createElement('label', { className: 'pn-label' }, t('field.' + key)),
        input,
        key === 'events' ? React.createElement('span', { className: 'pn-hint' }, t('hint.events'))
          : CHANNELS.includes(key) ? React.createElement('span', { className: 'pn-hint' }, t('hint.cred'))
          : null,
      )

      return React.createElement('li', { className: 'pn-card' },
        React.createElement('button', { type: 'button', className: 'pn-head', 'aria-expanded': open, onClick: () => setOpen((v) => !v) },
          React.createElement('span', { style: { display: 'flex', flexDirection: 'column' } },
            React.createElement('span', { className: 'pn-title' }, t('title')),
            React.createElement('span', { className: 'pn-sub' }, t('subtitle')),
          ),
          React.createElement(Chevron, { open }),
        ),
        open ? React.createElement('div', { className: 'pn-body' },
          status === 'loading'
            ? React.createElement('p', { className: 'pn-hint', style: { padding: '12px 0' } }, t('settings.loading'))
            : status !== 'ready'
              ? React.createElement('p', { className: 'pn-msg-err', style: { padding: '12px 0' } }, t('settings.unavailable'))
              : React.createElement('div', null,
                  React.createElement('p', { className: 'pn-hint', style: { padding: '12px 0 0' } }, t('intro')),
                  ...CHANNELS.map((ch) => field(ch, React.createElement('input', {
                    className: 'pn-input', value: (draft && draft[ch]) || '',
                    onChange: (e) => setDraft({ ...draft, [ch]: e.target.value }),
                    autoComplete: 'off',
                  }))),
                  field('events', React.createElement('input', {
                    className: 'pn-input', value: (draft && draft.events) || '',
                    onChange: (e) => setDraft({ ...draft, events: e.target.value }),
                  })),
                  field('timeoutMs', React.createElement('input', {
                    className: 'pn-input', type: 'number', value: (draft && draft.timeoutMs) || '',
                    onChange: (e) => setDraft({ ...draft, timeoutMs: e.target.value }),
                  })),
                  field('dndStart', React.createElement('input', {
                    className: 'pn-input', value: (draft && draft.dndStart) || '',
                    onChange: (e) => setDraft({ ...draft, dndStart: e.target.value }),
                  })),
                  field('dndEnd', React.createElement('input', {
                    className: 'pn-input', value: (draft && draft.dndEnd) || '',
                    onChange: (e) => setDraft({ ...draft, dndEnd: e.target.value }),
                  })),
                  field('excludePrefixes', React.createElement('input', {
                    className: 'pn-input', value: (draft && draft.excludePrefixes) || '',
                    onChange: (e) => setDraft({ ...draft, excludePrefixes: e.target.value }),
                  })),
                  React.createElement('div', { className: 'pn-field', style: { flexDirection: 'row', alignItems: 'center', gap: 8 } },
                    React.createElement('input', { type: 'checkbox', id: 'pn-local', checked: !!(draft && draft.local), onChange: (e) => setDraft({ ...draft, local: e.target.checked }) }),
                    React.createElement('label', { htmlFor: 'pn-local', className: 'pn-label' }, t('field.local')),
                  ),
                  React.createElement('div', { className: 'pn-field', style: { flexDirection: 'row', alignItems: 'center', gap: 8 } },
                    React.createElement('input', { type: 'checkbox', id: 'pn-sess', checked: !!(draft && draft.includeSession), onChange: (e) => setDraft({ ...draft, includeSession: e.target.checked }) }),
                    React.createElement('label', { htmlFor: 'pn-sess', className: 'pn-label' }, t('field.includeSession')),
                  ),
                  React.createElement('div', { className: 'pn-field', style: { flexDirection: 'row', alignItems: 'center', gap: 8 } },
                    React.createElement('input', { type: 'checkbox', id: 'pn-dur', checked: !!(draft && draft.includeDuration), onChange: (e) => setDraft({ ...draft, includeDuration: e.target.checked }) }),
                    React.createElement('label', { htmlFor: 'pn-dur', className: 'pn-label' }, t('field.includeDuration')),
                  ),
                  err ? React.createElement('div', { className: 'pn-msg-err' }, err) : null,
                  saved ? React.createElement('div', { className: 'pn-msg-ok' }, t('settings.saved')) : null,
                  React.createElement('div', { className: 'pn-foot' },
                    React.createElement('button', { type: 'button', className: 'pn-save', disabled: saving, onClick: save }, saving ? t('settings.saving') : t('settings.save')),
                  ),
                ),
        ) : null,
      )
    }

    function apply(ctx) {
      const t = ctx.locale ? ctx.locale.bind(NS) : ((k) => k)
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-plugin-notify: dictionaries')
      let placed = false
      try {
        placed = !!ctx.slots.inject('settings.plugin.item', () => {
          ctx.slots.register(
            { name: 'settings.plugin.item', key: NS, locale: NS, order: 40, inject: () => ({ ctx }) },
            (props) => React.createElement(NotifyCard, { ...props, ctx }),
          )
        })
      } catch (e) {
        console.warn('[dsh-plugin-notify] settings.plugin.item failed', e)
      }
      if (!placed) {
        try {
          ctx.slots.inject('settings.section', () => {
            ctx.slots.register(
              { name: 'settings.section', id: NS, order: 40, locale: NS, label: () => t('title'), inject: () => ({ ctx }) },
              (props) => React.createElement(NotifyCard, { ...props, ctx }),
            )
          })
        } catch (e) {
          console.warn('[dsh-plugin-notify] settings.section fallback failed', e)
        }
      }
    }

    module.exports = { apply, inject: ['slots', 'locale', 'settingsScope'] }
    return module.exports
  },
})
