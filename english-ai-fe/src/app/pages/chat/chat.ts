import { Component, signal, inject, ElementRef, ViewChild, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AI_API_URL } from '../../shared/api';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: string;
  translation?: string;
}

const STORAGE_KEY = 'bhashaai_chat_history';

@Component({
  selector: 'app-chat',
  imports: [FormsModule],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class Chat implements OnInit {
  private http = inject(HttpClient);

  @ViewChild('chatContainer') chatContainer!: ElementRef;

  userMessage = signal('');
  isLoading = signal(false);
  messages = signal<ChatMessage[]>([]);

  ngOnInit() {
    this.loadHistory();
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

    // Send last 5 messages as history
    const allMsgs = this.messages();
    const historyToSend = allMsgs.slice(-6, -1).map(m => ({ role: m.role, content: m.content }));

    this.http
      .post<{ success: boolean; reply: string; translation?: string }>(`${AI_API_URL}/chat`, {
        message: msg,
        history: historyToSend,
      })
      .subscribe({
        next: (res) => {
          const aiMsg: ChatMessage = { role: 'ai', content: res.reply || 'Something went wrong.', timestamp: new Date().toISOString(), translation: res.translation || '' };
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
      content: "Hello! I'm Bhasha AI. Type in any language — I'll reply in the same language! Ask me anything.",
      timestamp: new Date().toISOString(),
    };
  }

  private saveHistory() {
    const msgs = this.messages();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-50)));
  }

  private scrollToBottom() {
    setTimeout(() => {
      if (this.chatContainer) {
        this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
      }
    }, 50);
  }
}
