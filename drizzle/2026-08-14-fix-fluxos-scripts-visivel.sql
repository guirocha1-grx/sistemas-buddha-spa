UPDATE fluxos f
JOIN scripts s ON s.fluxoId = f.id AND s.tipo = 'fluxo'
SET f.visivelNoInbox = 1
WHERE f.visivelNoInbox = 0;
