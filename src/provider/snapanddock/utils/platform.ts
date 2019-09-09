
export function isWin10() {
    return Promise.resolve(navigator.userAgent.includes('Windows NT 10')||navigator.userAgent.includes('Windows 10'));
}
