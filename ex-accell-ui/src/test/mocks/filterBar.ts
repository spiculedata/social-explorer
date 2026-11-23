import { fireEvent, screen } from '@testing-library/svelte';

/** Types a date into the FilterBar the way a person does: the input updates the field, the change event reports it. */
export async function typeFilterDate(label: 'Start date' | 'End date', value: string): Promise<void> {
  const input = await screen.findByLabelText(label);
  await fireEvent.input(input, { target: { value } });
  await fireEvent.change(input);
}
