import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@ainotate/review-editor';
import { ReviewWorkerPoolProvider } from '@ainotate/review-editor/worker-pool';
import '@ainotate/review-editor/styles';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {/* Worker-pool syntax highlighting — tokenization off the main thread
        (diffshub parity). Pierre's CodeView/FileDiff pick the pool up from
        context automatically. */}
    <ReviewWorkerPoolProvider>
      <App />
    </ReviewWorkerPoolProvider>
  </React.StrictMode>
);
