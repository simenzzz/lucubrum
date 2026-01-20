import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'api-node' });
});

app.listen(PORT, () => {
  console.log(`Node API listening on port ${PORT}`);
});
