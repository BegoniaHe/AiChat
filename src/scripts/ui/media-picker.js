/**
 * Media picker (URL or local file placeholder)
 */

export class MediaPicker {
  constructor({ onUrl, onFile }) {
    this.onUrl = onUrl;
    this.onFile = onFile;
    this.inputImage = this.createFileInput('image/*');
    this.inputAudio = this.createFileInput('audio/*');
    this.inputDocument = this.createFileInput(
      'text/*,.txt,.md,.markdown,.json,.csv,.tsv,.log,.xml,.yaml,.yml,.ini,.cfg,.conf,.pdf,.doc,.docx',
    );
  }

  createFileInput(accept) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    return input;
  }

  async pickUrl(promptText, fallback = '') {
    const url = prompt(promptText, fallback);
    if (url) this.onUrl?.(url);
  }

  async pickFile(kind = 'image') {
    const input =
      kind === 'audio'
        ? this.inputAudio
        : kind === 'document'
          ? this.inputDocument
          : this.inputImage;
    return new Promise((resolve) => {
      input.onchange = () => {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        if (kind === 'document') {
          this.onFile?.(null, file, 'document');
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          this.onFile?.(reader.result, file, kind);
          resolve(reader.result);
        };
        reader.onerror = () => {
          alert('讀取文件失敗，請重試');
          resolve(null);
        };
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }
}
