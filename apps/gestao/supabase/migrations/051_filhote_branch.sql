-- Ramo Filhote (5 a 7 anos), antes do Lobinho. O grupo ainda não tem o ramo: no app ele fica atrás de um interruptor
-- (`FILHOTES_ENABLED`, lib/features.ts) e, desligado, não aparece nem é aceito pelas telas. No banco é um ramo de
-- jovens como os outros (seção sem equipes, controle do público jovem, responsáveis).
alter type public.scout_branch add value if not exists 'filhote' before 'lobinho';
