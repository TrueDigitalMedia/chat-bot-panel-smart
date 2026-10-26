-- El primer "sí" a la pregunta de conflicto de interés dejó de descalificar: ahora se
-- repregunta enumerando los sectores y solo el segundo "sí" descarta. La marca de "ya se le
-- repreguntó" va en la base y no en el callback del botón porque el lead puede contestar
-- escribiendo ("si"), y en ese caso no hay callback propio que distinga un intento del otro.
--
-- Arranca en false para todo el mundo: un lead que ya está en la ficha simplemente recibe la
-- repregunta la próxima vez que conteste que sí, que es exactamente lo que se busca.
ALTER TABLE "ficha_hogar_profiles"
  ADD COLUMN "conflict_of_interest_reasked" boolean NOT NULL DEFAULT false;
