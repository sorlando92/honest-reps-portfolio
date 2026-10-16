-- Q54: when protein, fat and carb floors force calories above the formula,
-- the targets row carries a note for the coach. Additive.
alter table public.targets add column note text check (char_length(note) <= 300);
