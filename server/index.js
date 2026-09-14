import { app, processarCampanhasAgendadas, SCHEDULER_INTERVAL_MS } from './app.js';

const { PORT = 8090 } = process.env;

setInterval(processarCampanhasAgendadas, SCHEDULER_INTERVAL_MS);

app.listen(PORT, () => {
  console.log(`Painel de Leads rodando na porta ${PORT}`);
});
