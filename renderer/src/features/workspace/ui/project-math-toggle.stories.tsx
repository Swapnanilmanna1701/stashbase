import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { ProjectRegistryPort } from '@/features/workspace/application/ports';

import { ProjectMathToggle } from './project-math-toggle';

const snapshot = { activeFolder: null, homeDirectory: '/project', projects: [] };
const port: ProjectRegistryPort = {
  load: async () => snapshot,
  openFolder: async () => snapshot,
  removeFolder: async () => snapshot,
  setMathMode: async () => snapshot,
};

const meta = {
  component: ProjectMathToggle,
  args: { enabled: false, folderPath: '/project', port },
  decorators: [
    (Story) => (
      <QueryClientProvider client={new QueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
  title: 'Compositions/Project math mode',
} satisfies Meta<typeof ProjectMathToggle>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Off: Story = {};
export const On: Story = { args: { enabled: true } };
