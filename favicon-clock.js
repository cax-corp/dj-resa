/* Dedicated clock for the background favicon. Terminated on return to the page. */
let timer;
self.onmessage = event => {
  clearInterval(timer);
  if (event.data === 'start') {
    timer = setInterval(() => self.postMessage('tick'), 125);
  }
};
