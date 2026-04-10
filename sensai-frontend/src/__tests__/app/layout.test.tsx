import { render, screen } from '@testing-library/react';
import RootLayout, { metadata } from '@/app/layout';

jest.mock('next-auth/next', () => ({
    getServerSession: jest.fn(() => Promise.resolve(null)),
}));

// Mock Google Fonts
jest.mock('next/font/google', () => ({
    Geist: () => ({
        variable: '--font-geist-sans',
    }),
    Geist_Mono: () => ({
        variable: '--font-geist-mono',
    }),
}));

// Mock SessionProvider
jest.mock('@/providers/SessionProvider', () => {
    return {
        SessionProvider: ({ children }: { children: React.ReactNode }) => (
            <div data-testid="session-provider">{children}</div>
        ),
    };
});

// Mock IntegrationProvider
jest.mock('@/context/IntegrationContext', () => {
    return {
        IntegrationProvider: ({ children }: { children: React.ReactNode }) => (
            <div data-testid="integration-provider">{children}</div>
        ),
        useIntegration: () => ({
            hasIntegration: false,
            isLoading: false,
            isIntegrationCheckComplete: true,
            error: null,
            pages: [],
            isLoadingPages: false,
            noPagesFound: false,
            showDropdown: false,
            isConnecting: false,
            isOAuthCallbackComplete: false,
            connectIntegration: jest.fn(),
            setShowDropdown: jest.fn(),
        }),
    };
});

describe('Layout', () => {
    describe('Metadata', () => {
        it('should have correct title and description', () => {
            expect(metadata.title).toMatchObject({ default: 'SensAI', template: '%s · SensAI' });
            expect(metadata.description).toBe('The only LMS you need in the era of AI');
        });
    });

    describe('Layout Structure', () => {
        it('should render with proper structure', async () => {
            const tree = await RootLayout({
                children: <div>Test Content</div>,
            });
            render(tree);

            expect(screen.getByTestId('session-provider')).toBeInTheDocument();
            expect(screen.getByTestId('integration-provider')).toBeInTheDocument();
            expect(screen.getByText('Test Content')).toBeInTheDocument();
        });

        it('should wrap children in SessionProvider and IntegrationProvider', async () => {
            const tree = await RootLayout({
                children: <div data-testid="test-child">Test Content</div>,
            });
            render(tree);

            const sessionProvider = screen.getByTestId('session-provider');
            const integrationProvider = screen.getByTestId('integration-provider');
            const testChild = screen.getByTestId('test-child');

            expect(sessionProvider).toBeInTheDocument();
            expect(integrationProvider).toBeInTheDocument();
            expect(sessionProvider).toContainElement(integrationProvider);
            expect(integrationProvider).toContainElement(testChild);
        });
    });
}); 