let theme;
try{theme=localStorage.getItem('qm-cham-theme');}catch{}
theme=theme==='dark'||theme==='light'?theme:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
document.documentElement.dataset.theme=theme;
document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#000000':'#F2F2F7');
