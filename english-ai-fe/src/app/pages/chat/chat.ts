import { Component, signal, inject, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
}

@Component({
  selector: 'app-chat',
  imports: [FormsModule],
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class Chat {
  private http = inject(HttpClient);

  @ViewChild('chatContainer') chatContainer!: ElementRef;

  selectedLanguage = signal('english');
  userMessage = signal('');
  isLoading = signal(false);

  messages = signal<ChatMessage[]>([
    {
      role: 'ai',
      content: "Hello! I'm your BhashaAI language tutor. How can I help you learn today? You can ask me about grammar, vocabulary, or just practice a conversation!",
      timestamp: new Date(),
    },
  ]);

  onLanguageChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedLanguage.set(select.value);
  }

  sendMessage() {
    const msg = this.userMessage().trim();
    if (!msg || this.isLoading()) return;

    const userMsg: ChatMessage = { role: 'user', content: msg, timestamp: new Date() };
    this.messages.update(msgs => [...msgs, userMsg]);
    this.userMessage.set('');
    this.isLoading.set(true);
    this.scrollToBottom();

    this.http
      .post<{ reply: string }>('http://127.0.0.1:3000/api/ai/chat', {
        message: msg,
        language: this.selectedLanguage(),
      })
      .subscribe({
        next: (res) => {
          const aiMsg: ChatMessage = { role: 'ai', content: res.reply, timestamp: new Date() };
          this.messages.update(msgs => [...msgs, aiMsg]);
          this.isLoading.set(false);
          this.scrollToBottom();
        },
        error: () => {
          const aiMsg: ChatMessage = {
            role: 'ai',
            content: "Sorry, I couldn't connect to the server. Please make sure the backend is running.",
            timestamp: new Date(),
          };
          this.messages.update(msgs => [...msgs, aiMsg]);
          this.isLoading.set(false);
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

  private scrollToBottom() {
    setTimeout(() => {
      if (this.chatContainer) {
        this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
      }
    }, 50);
  }
}
