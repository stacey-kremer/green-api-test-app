import { useEffect, useRef, useState } from 'react'
import logo from './assets/logo.png'
import telegramIcon from './assets/telegram.svg'
import './App.css'

const credentialsStorageKey = 'green-api.credentials'

function readSavedCredentials() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(credentialsStorageKey))
    return {
      idInstance: typeof saved?.idInstance === 'string' ? saved.idInstance : '',
      apiTokenInstance: typeof saved?.apiTokenInstance === 'string' ? saved.apiTokenInstance : '',
    }
  } catch {
    return { idInstance: '', apiTokenInstance: '' }
  }
}

function UserWidget({ instance, onDisconnect }) {
  const [isOpen, setIsOpen] = useState(false)
  const widgetRef = useRef(null)
  const triggerRef = useRef(null)
  const menuItemRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return

    menuItemRef.current?.focus()

    function closeOutside(event) {
      if (!widgetRef.current?.contains(event.target)) setIsOpen(false)
    }

    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('focusin', closeOutside)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('focusin', closeOutside)
    }
  }, [isOpen])

  return (
    <div
      className="user-widget"
      ref={widgetRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isOpen) {
          event.preventDefault()
          setIsOpen(false)
          triggerRef.current?.focus()
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          setIsOpen(true)
          menuItemRef.current?.focus()
        } else if (event.key === 'Tab') {
          setIsOpen(false)
        }
      }}
    >
      <button
        className="user-trigger"
        id="user-menu-trigger"
        ref={triggerRef}
        type="button"
        aria-label={`Меню инстанса ${instance}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? 'user-menu' : undefined}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="user-avatar" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="12" cy="8" r="3.5" />
            <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
          </svg>
        </span>
        <span className="user-details">
          <span>Инстанс</span>
          <strong title={instance}>{instance}</strong>
        </span>
        <svg className="user-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m8 10 4 4 4-4" />
        </svg>
      </button>

      {isOpen && (
        <div className="user-menu" id="user-menu" role="menu" aria-labelledby="user-menu-trigger">
          <button
            type="button"
            role="menuitem"
            ref={menuItemRef}
            onClick={() => {
              setIsOpen(false)
              onDisconnect()
            }}
          >
            Вернуться к подключению
          </button>
        </div>
      )}
    </div>
  )
}

function App() {
  const [credentials, setCredentials] = useState(readSavedCredentials)
  const { idInstance, apiTokenInstance } = credentials
  const [storageError, setStorageError] = useState('')
  const [isConnected, setIsConnected] = useState(false)

  const [phone, setPhone] = useState('')
  const [chatId, setChatId] = useState('')
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState([])
  const [phoneError, setPhoneError] = useState('')
  const [sendError, setSendError] = useState('')
  const [receiveError, setReceiveError] = useState('')
  const [isSending, setIsSending] = useState(false)

  const seenMessageIds = useRef(new Set())
  const chatIdRef = useRef(chatId)
  const conversationVersion = useRef(0)
  const sendController = useRef(null)
  const messagesRef = useRef(null)
  const composerRef = useRef(null)
  const phoneErrorRef = useRef(null)
  const followMessages = useRef(true)

  useEffect(() => {
    if (followMessages.current && messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight
    }
  }, [messages, chatId])

  useEffect(() => {
    if (chatId && !isSending) composerRef.current?.focus()
  }, [chatId, isSending])

  useEffect(() => () => sendController.current?.abort(), [])

  useEffect(() => {
    if (phoneError) phoneErrorRef.current?.scrollIntoView({ block: 'nearest' })
  }, [phoneError])

  function handleConnect(event) {
    event.preventDefault()

    if (!idInstance.trim() || !apiTokenInstance.trim()) return

    const nextCredentials = {
      idInstance: idInstance.trim(),
      apiTokenInstance: apiTokenInstance.trim(),
    }
    setCredentials(nextCredentials)
    try {
      window.localStorage.setItem(credentialsStorageKey, JSON.stringify(nextCredentials))
      setStorageError('')
    } catch {
      setStorageError('Браузер не разрешил сохранить данные подключения. После перезагрузки введите их снова.')
    }

    setPhoneError('')
    setSendError('')
    setReceiveError('')
    setIsConnected(true)
  }

  function handleDisconnect() {
    conversationVersion.current += 1
    sendController.current?.abort()
    chatIdRef.current = ''
    setIsConnected(false)
    setChatId('')
    setMessages([])
    setMessage('')
    setIsSending(false)
    setPhoneError('')
    setSendError('')
    setReceiveError('')
    seenMessageIds.current.clear()
  }

  function handleCreateChat(event) {
    event.preventDefault()

    const value = phone.trim()

    if (!/^\+?\d+$/.test(value)) {
      setPhoneError('Введите номер с кодом страны: только цифры и необязательный «+» в начале.')
      return
    }

    const normalizedPhone = value.replace(/^\+/, '')
    conversationVersion.current += 1
    sendController.current?.abort()
    chatIdRef.current = `${normalizedPhone}@c.us`
    followMessages.current = true
    setChatId(`${normalizedPhone}@c.us`)
    setMessages([])
    setMessage('')
    setIsSending(false)
    setPhoneError('')
    setSendError('')
    setReceiveError('')
    seenMessageIds.current.clear()
  }

  async function handleSend(event) {
    event.preventDefault()

    const text = message.trim()
    if (!text || !chatId || isSending) return

    const version = conversationVersion.current
    const controller = new AbortController()
    sendController.current = controller
    setIsSending(true)
    setSendError('')

    try {
      const url = `https://api.green-api.com/waInstance${idInstance.trim()}/sendMessage/${apiTokenInstance.trim()}`

      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          message: text,
        }),
      })

      if (!response.ok) {
        throw new Error(`ошибка API: ${response.status}`)
      }

      const data = await response.json()
      if (controller.signal.aborted || version !== conversationVersion.current) return

      followMessages.current = true
      setMessages((current) => [
        ...current,
        { id: data.idMessage ?? Date.now(), text, type: 'outgoing' },
      ])
      setMessage('')
    } catch (err) {
      if (err.name !== 'AbortError' && version === conversationVersion.current) {
        setSendError(`Не удалось отправить сообщение: ${err.message}. Попробуйте ещё раз.`)
      }
    } finally {
      if (version === conversationVersion.current) {
        setIsSending(false)
        sendController.current = null
      }
    }
  }

  useEffect(() => {
    if (!isConnected || !chatId) return

    let stopped = false
    const controller = new AbortController()
    const baseUrl = `https://api.green-api.com/waInstance${idInstance.trim()}`
    const token = apiTokenInstance.trim()

    async function pollNotifications() {
      while (!stopped) {
        try {
          const response = await fetch(
            `${baseUrl}/receiveNotification/${token}?receiveTimeout=5`,
            { signal: controller.signal },
          )

          if (!response.ok) {
            throw new Error(`ошибка получения: ${response.status}`)
          }

          const raw = await response.text()
          if (!raw || raw === 'null') {
            if (!stopped) setReceiveError('')
            continue
          }

          const notification = JSON.parse(raw)
          if (!notification?.receiptId || !notification?.body) continue

          const { receiptId, body } = notification
          const text = body.messageData?.textMessageData?.textMessage
          const senderChatId = body.senderData?.chatId
          const messageId = body.idMessage

          if (
            !stopped &&
            body.typeWebhook === 'incomingMessageReceived' &&
            body.messageData?.typeMessage === 'textMessage' &&
            text &&
            messageId &&
            senderChatId === chatIdRef.current &&
            !seenMessageIds.current.has(messageId)
          ) {
            seenMessageIds.current.add(messageId)
            setMessages((current) => [
              ...current,
              { id: messageId, text, type: 'incoming' },
            ])
          }

          const deleteResponse = await fetch(
            `${baseUrl}/deleteNotification/${token}/${receiptId}`,
            { method: 'DELETE', signal: controller.signal },
          )

          if (!deleteResponse.ok) {
            throw new Error(`ошибка удаления: ${deleteResponse.status}`)
          }

          const deleteResult = await deleteResponse.json()
          if (!deleteResult.result) {
            throw new Error('уведомление не удалено из очереди')
          }

          if (!stopped) setReceiveError('')
        } catch (err) {
          if (stopped || err.name === 'AbortError') break

          setReceiveError(`Не удалось получить сообщения: ${err.message}. Повторная попытка через 5 секунд.`)
          await new Promise((resolve) => setTimeout(resolve, 5000))
        }
      }
    }

    pollNotifications()

    return () => {
      stopped = true
      controller.abort()
    }
  }, [isConnected, chatId, idInstance, apiTokenInstance])

  if (!isConnected) {
    return (
      <main className="shell auth-shell">
        <section className="aurora" aria-hidden="true">
          <span/>
          <span/>
          <span/>
        </section>

        <section className="auth-card">
          <div className="brand-row">
            <img className="brand-mark" src={logo} width="42" height="42" alt="Логотип GREEN-API" />
            <p>GREEN-API Messenger</p>
          </div>

          <div className="hero-copy">
            <h1>Подключитесь к своему чату</h1>
            <p>
              Введите ID инстанса, чтобы подключиться. Затем выберите получателя и начните переписку.
            </p>
          </div>

          <form className="form-panel" onSubmit={handleConnect}>
            <h2 className="form-title">Подключите рабочий чат</h2>
            <div className="field-group">
              <label htmlFor="idInstance">ID инстанса</label>
              <input
                id="idInstance"
                value={idInstance}
                onChange={(event) => setCredentials((current) => ({ ...current, idInstance: event.target.value }))}
                placeholder="1101123456"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>

            <div className="field-group">
              <label htmlFor="apiTokenInstance">API-токен</label>
              <input
                id="apiTokenInstance"
                type="password"
                value={apiTokenInstance}
                onChange={(event) => setCredentials((current) => ({ ...current, apiTokenInstance: event.target.value }))}
                placeholder="Введите apiTokenInstance"
                autoComplete="off"
                spellCheck={false}
                required
              />
            </div>

            <button className="primary-button" type="submit">
              Открыть чат
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="shell chat-shell">
      <section className="aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </section>

      <aside className="sidebar">
        <div className="brand-row">
          <img className="brand-mark" src={logo} width="42" height="42" alt="Логотип GREEN-API" />
          <p>GREEN-API</p>
        </div>

        <form className="form-panel compact" onSubmit={handleCreateChat}>
          <div className="field-group">
            <label htmlFor="phone">Получатель</label>
            <input
              id="phone"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value)
                if (phoneError) setPhoneError('')
              }}
              placeholder="+79991234567"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              aria-describedby={phoneError ? 'phone-hint phone-error' : 'phone-hint'}
              aria-invalid={Boolean(phoneError)}
              required
            />
            <p className="field-hint" id="phone-hint">
              Введите номер с кодом страны
            </p>
            {phoneError && (
              <p role="alert" className="field-error" id="phone-error" ref={phoneErrorRef}>
                {phoneError}
              </p>
            )}
          </div>
          <button className="secondary-button" type="submit">
            Создать чат
          </button>
        </form>

        {storageError && <p className="field-error" role="status">{storageError}</p>}
        <UserWidget instance={idInstance.trim()} onDisconnect={handleDisconnect} />
      </aside>

      <section className="chat-panel" aria-label="Диалог">
        <header className="chat-header">
          <div>
            <h1>{chatId ? chatId.split('@')[0] : 'Выберите получателя'}</h1>
          </div>
          {chatId && <span className="chat-chip">{chatId}</span>}
        </header>

        <div
          className="messages"
          ref={messagesRef}
          role="log"
          aria-label="Сообщения"
          aria-live="polite"
          aria-relevant="additions text"
          onScroll={(event) => {
            const { scrollTop, scrollHeight, clientHeight } = event.currentTarget
            followMessages.current = scrollHeight - scrollTop - clientHeight < 80
          }}
        >
          {!chatId ? (
            <div className="empty-state">
              <span className="empty-icon">
                <img src={telegramIcon} width="40" height="40" alt="" />
              </span>
              <p>Введите номер получателя, чтобы начать переписку</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">
                <img src={telegramIcon} width="40" height="40" alt="" />
              </span>
              <p>Пока здесь тихо. Отправьте первое сообщение.</p>
            </div>
          ) : (
            messages.map((item) => (
              <article className={`message ${item.type}`} key={item.id}>
                <p>{item.text}</p>
                <small>{item.type === 'incoming' ? 'Собеседник' : 'Вы'}</small>
              </article>
            ))
          )}
        </div>

        {(sendError || receiveError) && (
          <div className="error" role="alert">
            {sendError && <p>{sendError}</p>}
            {receiveError && <p>{receiveError}</p>}
          </div>
        )}

        <form className="composer" onSubmit={handleSend}>
          <label className="sr-only" htmlFor="message">
            Сообщение
          </label>
          <input
            id="message"
            ref={composerRef}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={chatId ? 'Напишите сообщение...' : 'Сначала создайте чат'}
            disabled={!chatId || isSending}
            autoComplete="off"
            required
          />
          <button
            className="primary-button"
            type="submit"
            disabled={isSending || !chatId || !message.trim()}
            aria-busy={isSending}
          >
            {isSending && <span className="sending-indicator" aria-hidden="true" />}
            {isSending ? 'Отправка…' : 'Отправить'}
          </button>
        </form>
      </section>
    </main>
  )
}

export default App
