import {
  app,
  processarCampanhasAgendadas,
  SCHEDULER_INTERVAL_MS,
  limparConvitesExpirados,
  LIMPEZA_CONVITES_INTERVAL_MS,
} from './app.js';

const { PORT = 8090 } = process.env;

setInterval(processarCampanhasAgendadas, SCHEDULER_INTERVAL_MS);

// Apaga convites vencidos (e as senhas em texto puro deles) ao subir e a cada hora.
limparConvitesExpirados();
setInterval(limparConvitesExpirados, LIMPEZA_CONVITES_INTERVAL_MS);

app.listen(PORT, () => {
  console.log(`Painel de Leads rodando na porta ${PORT}`);
});
