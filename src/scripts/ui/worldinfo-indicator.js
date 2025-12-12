/**
 * 世界書指示器：顯示當前啟用的世界書名稱
 */

export class WorldInfoIndicator {
    constructor() {
        this.el = document.createElement('span');
        this.el.className = 'badge';
        this.el.style.marginLeft = '4px';
        this.setName('未啟用');
    }

    mount(target) {
        target?.appendChild(this.el);
    }

    setName(name) {
        this.el.textContent = `世界書: ${name}`;
    }
}
