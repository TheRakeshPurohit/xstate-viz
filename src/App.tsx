import { Box, ChakraProvider } from '@chakra-ui/react';
import React, { useEffect, useCallback } from 'react';
import { useActor, useInterpret, useSelector } from '@xstate/react';
import { useRouter } from 'next/router';
import { AuthProvider } from './authContext';
import { createAuthMachine } from './authMachine';
import { CanvasProvider } from './CanvasContext';
import { EmbedProvider } from './embedContext';
import { CanvasView } from './CanvasView';
import './Graph';
import { GetSourceFileSsrQuery } from './graphql/GetSourceFileSSR.generated';
import { isOnClientSide } from './isOnClientSide';
import { MachineNameChooserModal } from './MachineNameChooserModal';
import { PaletteProvider } from './PaletteContext';
import { paletteMachine } from './paletteMachine';
import { PanelsView } from './PanelsView';
import { SimulationProvider } from './SimulationContext';
import { simulationMachine } from './simulationMachine';
import { getSourceActor } from './sourceMachine';
import { theme } from './theme';
import { EditorThemeProvider } from './themeContext';
import { EmbedContext, EmbedMode } from './types';
import { useInterpretCanvas } from './useInterpretCanvas';
import { Visibility } from './Visibility';

const getGridArea = (embed: EmbedContext) => {
  if (embed.isEmbedded && embed.mode === EmbedMode.Viz) {
    return 'canvas';
  }

  if (embed.isEmbedded && embed.mode === EmbedMode.Panels) {
    return 'panels';
  }

  return 'canvas panels';
};

export interface AppProps {
  sourceFile: GetSourceFileSsrQuery['getSourceFile'] | undefined;
  embed: EmbedContext;
}

function App(props: AppProps) {
  const paletteService = useInterpret(paletteMachine);
  // don't use `devTools: true` here as it would freeze your browser
  const simService = useInterpret(simulationMachine);
  const machine = useSelector(simService, (state) => {
    return state.context.currentSessionId
      ? state.context.serviceDataMap[state.context.currentSessionId!]?.machine
      : undefined;
  });

  const router = useRouter();

  const routerReplace = useCallback((url: string) => {
    /**
     * Apologies for this line of code. The reason this is here
     * is that XState + React Fast Refresh causes an error:
     *
     * Error: Unable to send event to child 'ctx => ctx.sourceRef'
     * from service 'auth'.
     *
     * router.replace causes this in development, but not in prod
     *
     * So, we use window.location.href in development (with the /viz
     * prefix which Next won't automatically add) and router.replace in prod
     */
    if (process.env.NODE_ENV === 'development') {
      window.location.href = `/viz${url}`;
    } else {
      router.replace(`${url}`);
    }
  }, []);

  const redirectToNewUrlFromLegacyUrl = useCallback(() => {
    const id = new URLSearchParams(window.location.search)?.get('id');
    routerReplace(`/${id}`);
  }, []);

  const authService = useInterpret(
    createAuthMachine({
      data: props.sourceFile,
      redirectToNewUrlFromLegacyUrl,
      routerReplace: router.replace,
    }),
  );

  const sourceService = useSelector(authService, getSourceActor);
  const [sourceState, sendToSourceService] = useActor(sourceService!);

  useEffect(() => {
    sendToSourceService({
      type: 'MACHINE_ID_CHANGED',
      id: machine?.id || '',
    });
  }, [machine?.id, sendToSourceService]);

  const sourceID = sourceState.context.sourceID;

  const canvasService = useInterpretCanvas({
    sourceID,
    embed: props.embed,
  });

  // This is because we're doing loads of things on client side anyway
  if (!isOnClientSide()) return null;

  return (
    <EmbedProvider value={props.embed}>
      <ChakraProvider theme={theme}>
        <EditorThemeProvider>
          <AuthProvider value={authService}>
            <PaletteProvider value={paletteService}>
              <SimulationProvider value={simService}>
                <Box
                  data-testid="app"
                  data-viz-theme="dark"
                  as="main"
                  display="grid"
                  gridTemplateColumns="1fr auto"
                  gridTemplateAreas={`"${getGridArea(props.embed)}"`}
                  height="100vh"
                >
                  <Visibility
                    isHidden={
                      props.embed.isEmbedded && props.embed.mode === 'panels'
                    }
                  >
                    <CanvasProvider value={canvasService}>
                      <CanvasView />
                    </CanvasProvider>
                  </Visibility>
                  <PanelsView data-testid="panels-view" />
                  <MachineNameChooserModal />
                </Box>
              </SimulationProvider>
            </PaletteProvider>
          </AuthProvider>
        </EditorThemeProvider>
      </ChakraProvider>
    </EmbedProvider>
  );
}

export default App;
