import { Component, signal, inject, ElementRef, ViewChild, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
}

const STORAGE_KEY = 'bhashaai_chat_history';
const LANG_KEY = 'bhashaai_chat_language';

@Component({
  selector: 'app-chat',
  imports: [FormsModule],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class Chat implements OnInit {
  private http = inject(HttpClient);

  @ViewChild('chatContainer') chatContainer!: ElementRef;

  selectedLanguage = signal('english');
  userMessage = signal('');
  isLoading = signal(false);

  messages = signal<ChatMessage[]>([]);

  ngOnInit() {
    this.loadHistory();
  }

  onLanguageChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedLanguage.set(select.value);
    localStorage.setItem(LANG_KEY, select.value);
  }

  sendMessage() {
    const msg = this.userMessage().trim();
    if (!msg || this.isLoading()) return;

    const userMsg: ChatMessage = { role: 'user', content: msg, timestamp: new Date().toISOString() };
    this.messages.update(msgs => [...msgs, userMsg]);
    this.userMessage.set('');
    this.isLoading.set(true);
    this.saveHistory();
    this.scrollToBottom();

    this.http
      .post<{ success: boolean; reply: string; error?: string }>('http://127.0.0.1:3001/api/ai/chat', {
        message: msg,
        language: this.selectedLanguage(),
      })
      .subscribe({
        next: (res) => {
          const content = res.reply || 'Something went wrong.';
          const aiMsg: ChatMessage = { role: 'ai', content, timestamp: new Date().toISOString() };
          this.messages.update(msgs => [...msgs, aiMsg]);
          this.isLoading.set(false);
          this.saveHistory();
          this.scrollToBottom();
        },
        error: (err) => {
          let content = "Sorry, I couldn't connect to the server. Please make sure the backend is running.";
          if (err.status && err.status !== 0) {
            content = err.error?.reply || err.error?.error || `Server error (${err.status}). Please try again.`;
          }
          const aiMsg: ChatMessage = { role: 'ai', content, timestamp: new Date().toISOString() };
          this.messages.update(msgs => [...msgs, aiMsg]);
          this.isLoading.set(false);
          this.saveHistory();
          this.scrollToBottom();
        },
      });
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  clearHistory() {
    localStorage.removeItem(STORAGE_KEY);
    this.messages.set([this.getWelcomeMessage()]);
    this.saveHistory();
  }

  private loadHistory() {
    const savedLang = localStorage.getItem(LANG_KEY);
    if (savedLang) this.selectedLanguage.set(savedLang);

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ChatMessage[];
        if (parsed.length > 0) {
          this.messages.set(parsed);
          setTimeout(() => this.scrollToBottom(), 100);
          return;
        }
      } catch {}
    }
    this.messages.set([this.getWelcomeMessage()]);
  }

  private getWelcomeMessage(): ChatMessage {
    return {
      role: 'ai',
      content: "Hello! I'm your BhashaAI language tutor. How can I help you learn today? You can ask me about grammar, vocabulary, or just practice a conversation!",
      timestamp: new Date().toISOString(),
    };
  }

  private saveHistory() {
    const msgs = this.messages();
    const toSave = msgs.slice(-50);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.chatContainer) {
        this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
      }
    }, 50);
  }
}
