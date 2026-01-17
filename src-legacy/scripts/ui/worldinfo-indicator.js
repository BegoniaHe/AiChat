/**
 * 世界书指示器：显示当前启用的世界书名称
 */

export class WorldInfoIndicator {
    constructor() {
        this.el = document.createElement('span');
        this.el.className = 'badge';
        this.el.style.marginLeft = '4px';
        this.setName('未启用');
    }

    mount(target) {
        target?.appendChild(this.el);
    }

    setName(name) {
        this.el.textContent = `人物设定: ${name}`;
    }
}
