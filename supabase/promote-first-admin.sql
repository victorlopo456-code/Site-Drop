-- Promove exclusivamente a conta informada para administradora.
update public.profiles
set role = 'admin', updated_at = now()
where id = '701210df-ee1d-44bc-9859-4fa5612557df';

-- Confirma o resultado sem exibir informações sensíveis.
select id, role, updated_at
from public.profiles
where id = '701210df-ee1d-44bc-9859-4fa5612557df';
