import { JSDOM } from "jsdom";
import * as React from "react";
import {
  act,
  render,
  fireEvent,
  waitFor,
  screen,
  prettyDOM,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import type { ErrorResponse } from "@remix-run/router";
import type { RouteObject } from "react-router-dom";
import {
  Form,
  Link,
  Route,
  RouterProvider,
  Outlet,
  createBrowserRouter,
  createHashRouter,
  isRouteErrorResponse,
  matchRoutes,
  useLoaderData,
  useActionData,
  useRouteError,
  useNavigate,
  useNavigation,
  useSubmit,
  useFetcher,
  useFetchers,
  UNSAFE_DataRouterStateContext as DataRouterStateContext,
  defer,
  useLocation,
  useMatches,
  useSearchParams,
  createRoutesFromElements,
} from "react-router-dom";

testDomRouter("<DataBrowserRouter>", createBrowserRouter, (url) =>
  getWindowImpl(url, false)
);

testDomRouter("<DataHashRouter>", createHashRouter, (url) =>
  getWindowImpl(url, true)
);

function testDomRouter(
  name: string,
  createTestRouter: typeof createBrowserRouter | typeof createHashRouter,
  getWindow: (initialUrl: string, isHash?: boolean) => Window
) {
  // Utility to assert location info based on the type of router
  function assertLocation(
    testWindow: Window,
    pathname: string,
    search?: string
  ) {
    if (name === "<DataHashRouter>") {
      // eslint-disable-next-line jest/no-conditional-expect
      expect(testWindow.location.hash).toEqual("#" + pathname + (search || ""));
    } else {
      // eslint-disable-next-line jest/no-conditional-expect
      expect(testWindow.location.pathname).toEqual(pathname);
      if (search) {
        expect(testWindow.location.search).toEqual(search);
      }
    }
  }

  describe(`Router: ${name}`, () => {
    let consoleWarn: jest.SpyInstance;
    let consoleError: jest.SpyInstance;

    beforeEach(() => {
      consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
      consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      window.__staticRouterHydrationData = undefined;
      consoleWarn.mockRestore();
      consoleError.mockRestore();
    });

    it("renders the first route that matches the URL", () => {
      let router = createTestRouter(
        createRoutesFromElements(<Route path="/" element={<h1>Home</h1>} />)
      );
      let { container } = render(<RouterProvider router={router} />);

      expect(getHtml(container)).toMatchInlineSnapshot(`
         "<div>
           <h1>
             Home
           </h1>
         </div>"
       `);
    });

    it("renders the first route that matches the URL when wrapped in a root Route", () => {
      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/my/base/path">
            <Route element={<Outlet />}>
              <Route path="thing" element={<h1>Heyooo</h1>} />
            </Route>
          </Route>
        ),
        {
          window: getWindow("/my/base/path/thing"),
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      expect(getHtml(container)).toMatchInlineSnapshot(`
         "<div>
           <h1>
             Heyooo
           </h1>
         </div>"
       `);
    });

    it("supports a basename prop", () => {
      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="thing" element={<h1>Heyooo</h1>} />
        ),
        {
          basename: "/my/base/path",
          window: getWindow("/my/base/path/thing"),
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      expect(getHtml(container)).toMatchInlineSnapshot(`
        "<div>
          <h1>
            Heyooo
          </h1>
        </div>"
      `);
    });

    it("renders with hydration data", async () => {
      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" element={<Comp />}>
            <Route path="child" element={<Comp />} />
          </Route>
        ),
        {
          window: getWindow("/child"),
          hydrationData: {
            loaderData: {
              "0": "parent data",
              "0-0": "child data",
            },
            actionData: {
              "0-0": "child action",
            },
          },
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Comp() {
        let data = useLoaderData();
        let actionData = useActionData();
        let navigation = useNavigation();
        return (
          <div>
            <>{data}</>
            <>{actionData}</>
            <>{navigation.state}</>
            <Outlet />
          </div>
        );
      }

      expect(getHtml(container)).toMatchInlineSnapshot(`
        "<div>
          <div>
            parent data
            child action
            idle
            <div>
              child data
              child action
              idle
            </div>
          </div>
        </div>"
      `);
    });

    it("handles automatic hydration from the window", async () => {
      window.__staticRouterHydrationData = {
        loaderData: {
          "0": "parent data",
          "0-0": "child data",
        },
        actionData: {
          "0-0": "child action",
        },
      };
      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" element={<Comp />}>
            <Route path="child" element={<Comp />} />
          </Route>
        ),
        {
          window: getWindow("/child"),
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Comp() {
        let data = useLoaderData();
        let actionData = useActionData();
        let navigation = useNavigation();
        return (
          <div>
            <>{data}</>
            <>{actionData}</>
            <>{navigation.state}</>
            <Outlet />
          </div>
        );
      }

      expect(getHtml(container)).toMatchInlineSnapshot(`
        "<div>
          <div>
            parent data
            child action
            idle
            <div>
              child data
              child action
              idle
            </div>
          </div>
        </div>"
      `);
    });

    it("deserializes ErrorResponse instances from the window", async () => {
      window.__staticRouterHydrationData = {
        loaderData: {},
        actionData: null,
        errors: {
          "0": {
            status: 404,
            statusText: "Not Found",
            internal: false,
            data: { not: "found" },
            __type: "RouteErrorResponse",
          },
        },
      };
      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" element={<h1>Nope</h1>} errorElement={<Boundary />} />
        )
      );
      let { container } = render(<RouterProvider router={router} />);

      function Boundary() {
        let error = useRouteError() as unknown;
        return isRouteErrorResponse(error) ? (
          <pre>{JSON.stringify(error)}</pre>
        ) : (
          <p>No :(</p>
        );
      }

      expect(getHtml(container)).toMatchInlineSnapshot(`
        "<div>
          <pre>
            {"status":404,"statusText":"Not Found","internal":false,"data":{"not":"found"}}
          </pre>
        </div>"
      `);
    });

    it("deserializes Error instances from the window", async () => {
      window.__staticRouterHydrationData = {
        loaderData: {},
        actionData: null,
        errors: {
          "0": {
            message: "error message",
            __type: "Error",
          },
        },
      };
      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" element={<h1>Nope</h1>} errorElement={<Boundary />} />
        )
      );
      let { container } = render(<RouterProvider router={router} />);

      function Boundary() {
        let error = useRouteError() as Error;
        return error instanceof Error ? (
          <>
            <pre>{error.toString()}</pre>
            <pre>stack:{error.stack}</pre>
          </>
        ) : (
          <p>No :(</p>
        );
      }

      expect(getHtml(container)).toMatchInlineSnapshot(`
        "<div>
          <pre>
            Error: error message
          </pre>
          <pre>
            stack:
          </pre>
        </div>"
      `);
    });

    it("renders fallbackElement while first data fetch happens", async () => {
      let fooDefer = createDeferred();
      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" element={<Outlet />}>
            <Route
              path="foo"
              loader={() => fooDefer.promise}
              element={<Foo />}
            />
            <Route path="bar" element={<Bar />} />
          </Route>
        ),
        {
          window: getWindow("/foo"),
        }
      );
      let { container } = render(
        <RouterProvider router={router} fallbackElement={<FallbackElement />} />
      );

      function FallbackElement() {
        return <p>Loading...</p>;
      }

      function Foo() {
        let data = useLoaderData() as { message: string };
        return <h1>Foo:{data.message}</h1>;
      }

      function Bar() {
        return <h1>Bar Heading</h1>;
      }

      expect(getHtml(container)).toMatchInlineSnapshot(`
        "<div>
          <p>
            Loading...
          </p>
        </div>"
      `);

      fooDefer.resolve({ message: "From Foo Loader" });
      await waitFor(() => screen.getByText("Foo:From Foo Loader"));
      expect(getHtml(container)).toMatchInlineSnapshot(`
        "<div>
          <h1>
            Foo:
            From Foo Loader
          </h1>
        </div>"
      `);
    });

    it("renders fallbackElement while first data fetch and lazy route load happens", async () => {
      let fooDefer = createDeferred();
      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" element={<Outlet />}>
            <Route
              path="foo"
              lazy={async () => {
                return {
                  loader: () => fooDefer.promise,
                  element: <Foo />,
                };
              }}
            />
            <Route path="bar" element={<Bar />} />
          </Route>
        ),
        {
          window: getWindow("/foo"),
        }
      );
      let { container } = render(
        <RouterProvider router={router} fallbackElement={<FallbackElement />} />
      );

      function FallbackElement() {
        return <p>Loading...</p>;
      }

      function Foo() {
        let data = useLoaderData() as { message: string };
        return <h1>Foo:{data.message}</h1>;
      }

      function Bar() {
        return <h1>Bar Heading</h1>;
      }

      expect(getHtml(container)).toMatchInlineSnapshot(`
        "<div>
          <p>
            Loading...
          </p>
        </div>"
      `);

      fooDefer.resolve({ message: "From Lazy Foo Loader" });
      await waitFor(() => screen.getByText("Foo:From Lazy Foo Loader"));
      expect(getHtml(container)).toMatchInlineSnapshot(`
        "<div>
          <h1>
            Foo:
            From Lazy Foo Loader
          </h1>
        </div>"
      `);
    });

    it("does not render fallbackElement if no data fetch or lazy loading is required", async () => {
      let fooDefer = createDeferred();
      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" element={<Outlet />}>
            <Route
              path="foo"
              loader={() => fooDefer.promise}
              element={<Foo />}
            />
            <Route path="bar" element={<Bar />} />
          </Route>
        ),
        {
          window: getWindow("/bar"),
        }
      );
      let { container } = render(
        <RouterProvider router={router} fallbackElement={<FallbackElement />} />
      );

      function FallbackElement() {
        return <p>Loading...</p>;
      }

      function Foo() {
        let data = useLoaderData() as { message: string };
        return <h1>Foo:{data.message}</h1>;
      }

      function Bar() {
        return <h1>Bar Heading</h1>;
      }

      expect(getHtml(container)).toMatchInlineSnapshot(`
        "<div>
          <h1>
            Bar Heading
          </h1>
        </div>"
      `);
    });

    it("renders fallbackElement within router contexts", async () => {
      let fooDefer = createDeferred();
      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" element={<Outlet />}>
            <Route
              path="foo"
              loader={() => fooDefer.promise}
              element={<Foo />}
            />
          </Route>
        ),
        { window: getWindow("/foo") }
      );
      let { container } = render(
        <RouterProvider router={router} fallbackElement={<FallbackElement />} />
      );

      function FallbackElement() {
        let location = useLocation();
        return <p>Loading{location.pathname}</p>;
      }

      function Foo() {
        let data = useLoaderData() as { message: string };
        return <h1>Foo:{data.message}</h1>;
      }

      expect(getHtml(container)).toMatchInlineSnapshot(`
        "<div>
          <p>
            Loading
            /foo
          </p>
        </div>"
      `);

      fooDefer.resolve({ message: "From Foo Loader" });
      await waitFor(() => screen.getByText("Foo:From Foo Loader"));
      expect(getHtml(container)).toMatchInlineSnapshot(`
        "<div>
          <h1>
            Foo:
            From Foo Loader
          </h1>
        </div>"
      `);
    });

    it("handles link navigations", async () => {
      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" element={<Layout />}>
            <Route path="foo" element={<h1>Foo Heading</h1>} />
            <Route path="bar" element={<h1>Bar Heading</h1>} />
          </Route>
        ),
        { window: getWindow("/foo") }
      );
      render(<RouterProvider router={router} />);

      function Layout() {
        return (
          <div>
            <Link to="/foo">Link to Foo</Link>
            <Link to="/bar">Link to Bar</Link>
            <Outlet />
          </div>
        );
      }

      expect(screen.getByText("Foo Heading")).toBeDefined();
      fireEvent.click(screen.getByText("Link to Bar"));
      await waitFor(() => screen.getByText("Bar Heading"));

      fireEvent.click(screen.getByText("Link to Foo"));
      await waitFor(() => screen.getByText("Foo Heading"));
    });

    it("handles link navigations when using a basename", async () => {
      let testWindow = getWindow("/base/name/foo");
      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" element={<Layout />}>
            <Route path="foo" element={<h1>Foo Heading</h1>} />
            <Route path="bar" element={<h1>Bar Heading</h1>} />
          </Route>
        ),
        {
          window: testWindow,
          basename: "/base/name",
        }
      );
      render(<RouterProvider router={router} />);

      function Layout() {
        return (
          <div>
            <Link to="/foo">Link to Foo</Link>
            <Link to="/bar">Link to Bar</Link>
            <div id="output">
              <Outlet />
            </div>
          </div>
        );
      }

      assertLocation(testWindow, "/base/name/foo");
      expect(screen.getByText("Foo Heading")).toBeDefined();

      fireEvent.click(screen.getByText("Link to Bar"));
      await waitFor(() => screen.getByText("Bar Heading"));
      assertLocation(testWindow, "/base/name/bar");

      fireEvent.click(screen.getByText("Link to Foo"));
      await waitFor(() => screen.getByText("Foo Heading"));
      assertLocation(testWindow, "/base/name/foo");
    });

    it("executes route loaders on navigation", async () => {
      let barDefer = createDeferred();

      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" element={<Layout />}>
            <Route path="foo" element={<Foo />} />
            <Route
              path="bar"
              loader={() => barDefer.promise}
              element={<Bar />}
            />
          </Route>
        ),
        { window: getWindow("/foo") }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Layout() {
        let navigation = useNavigation();
        return (
          <div>
            <Link to="/bar">Link to Bar</Link>
            <div id="output">
              <p>{navigation.state}</p>
              <Outlet />
            </div>
          </div>
        );
      }

      function Foo() {
        return <h1>Foo</h1>;
      }
      function Bar() {
        let data = useLoaderData() as { message: string };
        return <h1>{data.message}</h1>;
      }

      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              idle
            </p>
            <h1>
              Foo
            </h1>
          </div>"
        `);

      fireEvent.click(screen.getByText("Link to Bar"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              loading
            </p>
            <h1>
              Foo
            </h1>
          </div>"
        `);

      barDefer.resolve({ message: "Bar Loader" });
      await waitFor(() => screen.getByText("idle"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              idle
            </p>
            <h1>
              Bar Loader
            </h1>
          </div>"
        `);
    });

    it("executes lazy route loaders on navigation", async () => {
      let barDefer = createDeferred();

      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" element={<Layout />}>
            <Route path="foo" element={<Foo />} />
            <Route
              path="bar"
              lazy={async () => ({
                loader: () => barDefer.promise,
                element: <Bar />,
              })}
            />
          </Route>
        ),
        {
          window: getWindow("/foo"),
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Layout() {
        let navigation = useNavigation();
        return (
          <div>
            <Link to="/bar">Link to Bar</Link>
            <div id="output">
              <p>{navigation.state}</p>
              <Outlet />
            </div>
          </div>
        );
      }

      function Foo() {
        return <h1>Foo</h1>;
      }
      function Bar() {
        let data = useLoaderData() as { message: string };
        return <h1>{data.message}</h1>;
      }

      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              idle
            </p>
            <h1>
              Foo
            </h1>
          </div>"
        `);

      fireEvent.click(screen.getByText("Link to Bar"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              loading
            </p>
            <h1>
              Foo
            </h1>
          </div>"
        `);

      barDefer.resolve({ message: "Bar Loader" });
      await waitFor(() => screen.getByText("idle"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              idle
            </p>
            <h1>
              Bar Loader
            </h1>
          </div>"
        `);
    });

    it("handles link navigations with preventScrollReset", async () => {
      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" element={<Layout />}>
            <Route path="foo" element={<h1>Foo Heading</h1>} />
            <Route path="bar" element={<h1>Bar Heading</h1>} />
          </Route>
        ),
        { window: getWindow("/foo") }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Layout() {
        let state = React.useContext(DataRouterStateContext);
        return (
          <div>
            <Link to="/foo" preventScrollReset>
              Link to Foo
            </Link>
            <Link to="/bar">Link to Bar</Link>
            <p id="preventScrollReset">{String(state?.preventScrollReset)}</p>
            <Outlet />
          </div>
        );
      }

      fireEvent.click(screen.getByText("Link to Bar"));
      await waitFor(() => screen.getByText("Bar Heading"));
      expect(getHtml(container.querySelector("#preventScrollReset")!))
        .toMatchInlineSnapshot(`
        "<p
          id="preventScrollReset"
        >
          false
        </p>"
      `);

      fireEvent.click(screen.getByText("Link to Foo"));
      await waitFor(() => screen.getByText("Foo Heading"));
      expect(getHtml(container.querySelector("#preventScrollReset")!))
        .toMatchInlineSnapshot(`
        "<p
          id="preventScrollReset"
        >
          true
        </p>"
      `);
    });

    it("handles link navigations with preventScrollReset={true}", async () => {
      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" element={<Layout />}>
            <Route path="foo" element={<h1>Foo Heading</h1>} />
            <Route path="bar" element={<h1>Bar Heading</h1>} />
          </Route>
        ),
        { window: getWindow("/foo") }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Layout() {
        let state = React.useContext(DataRouterStateContext);
        return (
          <div>
            <Link to="/foo" preventScrollReset={true}>
              Link to Foo
            </Link>
            <Link to="/bar">Link to Bar</Link>
            <p id="preventScrollReset">{String(state?.preventScrollReset)}</p>
            <Outlet />
          </div>
        );
      }

      fireEvent.click(screen.getByText("Link to Bar"));
      await waitFor(() => screen.getByText("Bar Heading"));
      expect(getHtml(container.querySelector("#preventScrollReset")!))
        .toMatchInlineSnapshot(`
        "<p
          id="preventScrollReset"
        >
          false
        </p>"
      `);

      fireEvent.click(screen.getByText("Link to Foo"));
      await waitFor(() => screen.getByText("Foo Heading"));
      expect(getHtml(container.querySelector("#preventScrollReset")!))
        .toMatchInlineSnapshot(`
        "<p
          id="preventScrollReset"
        >
          true
        </p>"
      `);
    });

    it("executes route actions/loaders on useSubmit navigations", async () => {
      let loaderDefer = createDeferred();
      let actionDefer = createDeferred();

      let router = createTestRouter(
        createRoutesFromElements(
          <Route
            path="/"
            action={() => actionDefer.promise}
            loader={() => loaderDefer.promise}
            element={<Home />}
          />
        ),
        {
          window: getWindow("/"),
          hydrationData: { loaderData: { "0": null } },
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Home() {
        let data = useLoaderData() as string;
        let actionData = useActionData() as string | undefined;
        let navigation = useNavigation();
        let submit = useSubmit();
        let formRef = React.useRef<HTMLFormElement>(null);
        return (
          <div>
            <form method="post" action="/" ref={formRef}>
              <input name="test" value="value" />
            </form>
            <button onClick={() => submit(formRef.current!)}>
              Submit Form
            </button>
            <div id="output">
              <p>{navigation.state}</p>
              <p>{data}</p>
              <p>{actionData}</p>
            </div>
            <Outlet />
          </div>
        );
      }

      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            idle
          </p>
          <p />
          <p />
        </div>"
      `);

      fireEvent.click(screen.getByText("Submit Form"));
      await waitFor(() => screen.getByText("submitting"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            submitting
          </p>
          <p />
          <p />
        </div>"
      `);

      actionDefer.resolve("Action Data");
      await waitFor(() => screen.getByText("loading"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            loading
          </p>
          <p />
          <p>
            Action Data
          </p>
        </div>"
      `);

      loaderDefer.resolve("Loader Data");
      await waitFor(() => screen.getByText("idle"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            idle
          </p>
          <p>
            Loader Data
          </p>
          <p>
            Action Data
          </p>
        </div>"
      `);
    });

    it("executes lazy route actions/loaders on useSubmit navigations", async () => {
      let loaderDefer = createDeferred();
      let actionDefer = createDeferred();

      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" element={<Home />}>
            <Route index element={<h1>Home</h1>} />
            <Route
              path="action"
              lazy={async () => ({
                action: () => actionDefer.promise,
                loader: () => loaderDefer.promise,
                element: <h1>Action</h1>,
              })}
            />
          </Route>
        ),
        {
          window: getWindow("/"),
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Home() {
        let data = useMatches().pop()?.data as string | undefined;
        let actionData = useActionData() as string | undefined;
        let navigation = useNavigation();
        let submit = useSubmit();
        let formRef = React.useRef<HTMLFormElement>(null);
        return (
          <div>
            <form method="post" action="/action" ref={formRef}>
              <input name="test" value="value" />
            </form>
            <button onClick={() => submit(formRef.current)}>Submit Form</button>
            <div id="output">
              <p>{navigation.state}</p>
              <p>{data}</p>
              <p>{actionData}</p>
              <Outlet />
            </div>
          </div>
        );
      }

      await waitFor(() => screen.getByText("idle"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            idle
          </p>
          <p />
          <p />
          <h1>
            Home
          </h1>
        </div>"
      `);

      fireEvent.click(screen.getByText("Submit Form"));
      await waitFor(() => screen.getByText("submitting"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            submitting
          </p>
          <p />
          <p />
          <h1>
            Home
          </h1>
        </div>"
      `);

      actionDefer.resolve("Action Data");
      await waitFor(() => screen.getByText("loading"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            loading
          </p>
          <p />
          <p>
            Action Data
          </p>
          <h1>
            Home
          </h1>
        </div>"
      `);

      loaderDefer.resolve("Loader Data");
      await waitFor(() => screen.getByText("idle"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            idle
          </p>
          <p>
            Loader Data
          </p>
          <p>
            Action Data
          </p>
          <h1>
            Action
          </h1>
        </div>"
      `);
    });

    it("executes route loaders on <Form method=get> navigations", async () => {
      let loaderDefer = createDeferred();
      let actionDefer = createDeferred();

      let router = createTestRouter(
        createRoutesFromElements(
          <Route
            path="/"
            action={() => actionDefer.promise}
            loader={async ({ request }) => {
              let resolvedValue = await loaderDefer.promise;
              let urlParam = new URL(
                `https://remix.run${request.url}`
              ).searchParams.get("test");
              return `${resolvedValue}:${urlParam}`;
            }}
            element={<Home />}
          />
        ),
        {
          window: getWindow("/"),
          hydrationData: { loaderData: { "0": null } },
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Home() {
        let data = useLoaderData() as string;
        let actionData = useActionData() as string | undefined;
        let navigation = useNavigation();
        return (
          <div>
            <Form method="get">
              <input name="test" value="value" />
              <button type="submit">Submit Form</button>
            </Form>
            <div id="output">
              <p>{navigation.state}</p>
              <p>{data}</p>
              <p>{actionData}</p>
            </div>
            <Outlet />
          </div>
        );
      }

      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            idle
          </p>
          <p />
          <p />
        </div>"
      `);

      fireEvent.click(screen.getByText("Submit Form"));
      await waitFor(() => screen.getByText("loading"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            loading
          </p>
          <p />
          <p />
        </div>"
      `);

      loaderDefer.resolve("Loader Data");
      await waitFor(() => screen.getByText("idle"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            idle
          </p>
          <p>
            Loader Data:value
          </p>
          <p />
        </div>"
      `);
    });

    it("executes lazy route loaders on <Form method=get> navigations", async () => {
      let loaderDefer = createDeferred();
      let actionDefer = createDeferred();

      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" element={<Home />}>
            <Route index element={<h1>Home</h1>} />
            <Route
              path="path"
              lazy={async () => ({
                action: () => actionDefer.promise,
                loader: async ({ request }) => {
                  let resolvedValue = await loaderDefer.promise;
                  let urlParam = new URL(
                    `https://remix.run${request.url}`
                  ).searchParams.get("test");
                  return `${resolvedValue}:${urlParam}`;
                },
                element: <h1>Path</h1>,
              })}
            />
          </Route>
        ),
        {
          window: getWindow("/"),
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Home() {
        let data = useMatches().pop()?.data as string | undefined;
        let actionData = useActionData() as string | undefined;
        let navigation = useNavigation();
        return (
          <div>
            <Form method="get" action="path">
              <input name="test" value="value" />
              <button type="submit">Submit Form</button>
            </Form>
            <div id="output">
              <p>{navigation.state}</p>
              <p>{data}</p>
              <p>{actionData}</p>
              <Outlet />
            </div>
          </div>
        );
      }

      await waitFor(() => screen.getByText("idle"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            idle
          </p>
          <p />
          <p />
          <h1>
            Home
          </h1>
        </div>"
      `);

      fireEvent.click(screen.getByText("Submit Form"));
      await waitFor(() => screen.getByText("loading"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            loading
          </p>
          <p />
          <p />
          <h1>
            Home
          </h1>
        </div>"
      `);

      loaderDefer.resolve("Loader Data");
      await waitFor(() => screen.getByText("idle"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            idle
          </p>
          <p>
            Loader Data:value
          </p>
          <p />
          <h1>
            Path
          </h1>
        </div>"
      `);
    });

    it("executes route actions/loaders on <Form method=post> navigations", async () => {
      let loaderDefer = createDeferred();
      let actionDefer = createDeferred();

      let router = createTestRouter(
        createRoutesFromElements(
          <Route
            path="/"
            action={async ({ request }) => {
              let resolvedValue = await actionDefer.promise;
              let formData = await request.formData();
              return `${resolvedValue}:${formData.get("test")}`;
            }}
            loader={() => loaderDefer.promise}
            element={<Home />}
          />
        ),
        {
          window: getWindow("/"),
          hydrationData: { loaderData: { "0": null } },
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Home() {
        let data = useLoaderData() as string;
        let actionData = useActionData() as string | undefined;
        let navigation = useNavigation();
        return (
          <div>
            <Form method="post">
              <input name="test" value="value" />
              <button type="submit">Submit Form</button>
            </Form>
            <div id="output">
              <p>{navigation.state}</p>
              <p>{data}</p>
              <p>{actionData}</p>
            </div>
            <Outlet />
          </div>
        );
      }

      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            idle
          </p>
          <p />
          <p />
        </div>"
      `);

      fireEvent.click(screen.getByText("Submit Form"));
      await waitFor(() => screen.getByText("submitting"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            submitting
          </p>
          <p />
          <p />
        </div>"
      `);

      actionDefer.resolve("Action Data");
      await waitFor(() => screen.getByText("loading"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            loading
          </p>
          <p />
          <p>
            Action Data:value
          </p>
        </div>"
      `);

      loaderDefer.resolve("Loader Data");
      await waitFor(() => screen.getByText("idle"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            idle
          </p>
          <p>
            Loader Data
          </p>
          <p>
            Action Data:value
          </p>
        </div>"
      `);
    });

    it("executes lazy route actions/loaders on <Form method=post> navigations", async () => {
      let loaderDefer = createDeferred();
      let actionDefer = createDeferred();

      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" element={<Home />}>
            <Route index element={<h1>Home</h1>} />
            <Route
              path="action"
              lazy={async () => ({
                action: async ({ request }) => {
                  let resolvedValue = await actionDefer.promise;
                  let formData = await request.formData();
                  return `${resolvedValue}:${formData.get("test")}`;
                },
                loader: () => loaderDefer.promise,
                element: <h1>Action</h1>,
              })}
            />
          </Route>
        ),
        {
          window: getWindow("/"),
          hydrationData: { loaderData: { "0": null } },
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Home() {
        let data = useMatches().pop()?.data as string | undefined;
        let actionData = useActionData() as string | undefined;
        let navigation = useNavigation();
        return (
          <div>
            <Form method="post" action="action">
              <input name="test" value="value" />
              <button type="submit">Submit Form</button>
            </Form>
            <div id="output">
              <p>{navigation.state}</p>
              <p>{data}</p>
              <p>{actionData}</p>
              <Outlet />
            </div>
          </div>
        );
      }

      await waitFor(() => screen.getByText("idle"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            idle
          </p>
          <p />
          <p />
          <h1>
            Home
          </h1>
        </div>"
      `);

      fireEvent.click(screen.getByText("Submit Form"));
      await waitFor(() => screen.getByText("submitting"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            submitting
          </p>
          <p />
          <p />
          <h1>
            Home
          </h1>
        </div>"
      `);

      actionDefer.resolve("Action Data");
      await waitFor(() => screen.getByText("loading"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            loading
          </p>
          <p />
          <p>
            Action Data:value
          </p>
          <h1>
            Home
          </h1>
        </div>"
      `);

      loaderDefer.resolve("Loader Data");
      await waitFor(() => screen.getByText("idle"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            idle
          </p>
          <p>
            Loader Data
          </p>
          <p>
            Action Data:value
          </p>
          <h1>
            Action
          </h1>
        </div>"
      `);
    });

    it("supports <Form reloadDocument={true}>", async () => {
      let actionSpy = jest.fn();
      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/" action={actionSpy} element={<Home />} />
        )
      );
      render(<RouterProvider router={router} />);

      let handlerCalled;
      let defaultPrevented;

      function Home() {
        return (
          <Form
            method="post"
            reloadDocument={true}
            onSubmit={(e) => {
              handlerCalled = true;
              defaultPrevented = e.defaultPrevented;
            }}
          >
            <input name="test" value="value" />
            <button type="submit">Submit Form</button>
          </Form>
        );
      }

      fireEvent.click(screen.getByText("Submit Form"));
      expect(handlerCalled).toBe(true);
      expect(defaultPrevented).toBe(false);
      expect(actionSpy).not.toHaveBeenCalled();
    });

    it('defaults <Form method="get"> to be a PUSH navigation', async () => {
      let router = createTestRouter(
        createRoutesFromElements(
          <Route element={<Layout />}>
            <Route index loader={() => "index"} element={<h1>index</h1>} />
            <Route path="1" loader={() => "1"} element={<h1>Page 1</h1>} />
            <Route path="2" loader={() => "2"} element={<h1>Page 2</h1>} />
          </Route>
        ),
        {
          hydrationData: {},
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Layout() {
        let navigate = useNavigate();
        return (
          <>
            <Form action="1">
              <input name="test" defaultValue="value" />
              <button type="submit">Submit Form</button>
            </Form>
            <button onClick={() => navigate(-1)}>Go back</button>
            <div className="output">
              <Outlet />
            </div>
          </>
        );
      }

      expect(getHtml(container.querySelector(".output")!))
        .toMatchInlineSnapshot(`
        "<div
          class="output"
        >
          <h1>
            index
          </h1>
        </div>"
      `);

      fireEvent.click(screen.getByText("Submit Form"));
      await waitFor(() => screen.getByText("Page 1"));
      expect(getHtml(container.querySelector(".output")!))
        .toMatchInlineSnapshot(`
        "<div
          class="output"
        >
          <h1>
            Page 1
          </h1>
        </div>"
      `);

      fireEvent.click(screen.getByText("Go back"));
      await waitFor(() => screen.getByText("index"));
      expect(getHtml(container.querySelector(".output")!))
        .toMatchInlineSnapshot(`
        "<div
          class="output"
        >
          <h1>
            index
          </h1>
        </div>"
      `);
    });

    it('defaults <Form method="post"> to be a REPLACE navigation', async () => {
      let router = createTestRouter(
        createRoutesFromElements(
          <Route element={<Layout />}>
            <Route index loader={() => "index"} element={<h1>Index Page</h1>} />
            <Route
              path="form"
              action={() => "action data"}
              element={<FormPage />}
            />
            <Route path="result" element={<h1>Result Page</h1>} />
          </Route>
        ),
        {
          hydrationData: {},
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Layout() {
        let navigate = useNavigate();
        return (
          <>
            <Link to="form">Go to Form</Link>
            <button onClick={() => navigate(-1)}>Go back</button>
            <div className="output">
              <Outlet />
            </div>
          </>
        );
      }

      function FormPage() {
        let data = useActionData() as string | undefined;
        return (
          <Form method="post">
            <p>Form Page</p>
            <p>{data}</p>
            <input name="test" defaultValue="value" />
            <button type="submit">Submit</button>
          </Form>
        );
      }

      let html = () => getHtml(container.querySelector(".output")!);

      // Start on index page
      expect(html()).toMatch("Index Page");

      // Navigate to form page
      fireEvent.click(screen.getByText("Go to Form"));
      await waitFor(() => screen.getByText("Form Page"));
      expect(html()).not.toMatch("action result");

      // Submit without redirect does a replace
      fireEvent.click(screen.getByText("Submit"));
      await waitFor(() => screen.getByText("action data"));
      expect(html()).toMatch("Form Page");
      expect(html()).toMatch("action data");

      // Back navigate to index page
      fireEvent.click(screen.getByText("Go back"));
      await waitFor(() => screen.getByText("Index Page"));
    });

    it('Uses a PUSH navigation on <Form method="post"> if it redirects', async () => {
      let router = createTestRouter(
        createRoutesFromElements(
          <Route element={<Layout />}>
            <Route index loader={() => "index"} element={<h1>Index Page</h1>} />
            <Route
              path="form"
              action={() =>
                new Response(null, {
                  status: 302,
                  headers: { Location: "/result" },
                })
              }
              element={<FormPage />}
            />
            <Route path="result" element={<h1>Result Page</h1>} />
          </Route>
        ),
        { hydrationData: {} }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Layout() {
        let navigate = useNavigate();
        return (
          <>
            <Link to="form">Go to Form</Link>
            <button onClick={() => navigate(-1)}>Go back</button>
            <div className="output">
              <Outlet />
            </div>
          </>
        );
      }

      function FormPage() {
        let data = useActionData() as string | undefined;
        return (
          <Form method="post">
            <p>Form Page</p>
            <p>{data}</p>
            <input name="test" defaultValue="value" />
            <button type="submit">Submit</button>
          </Form>
        );
      }

      let html = () => getHtml(container.querySelector(".output")!);

      // Start on index page
      expect(html()).toMatch("Index Page");

      // Navigate to form page
      fireEvent.click(screen.getByText("Go to Form"));
      await waitFor(() => screen.getByText("Form Page"));

      // Submit with redirect
      fireEvent.click(screen.getByText("Submit"));
      await waitFor(() => screen.getByText("Result Page"));

      // Back navigate to form page
      fireEvent.click(screen.getByText("Go back"));
      await waitFor(() => screen.getByText("Form Page"));
    });

    it('defaults useSubmit({ method: "get" }) to be a PUSH navigation', async () => {
      let router = createTestRouter(
        createRoutesFromElements(
          <Route element={<Layout />}>
            <Route index loader={() => "index"} element={<h1>index</h1>} />
            <Route path="1" loader={() => "1"} element={<h1>Page 1</h1>} />
            <Route path="2" loader={() => "2"} element={<h1>Page 2</h1>} />
          </Route>
        ),
        {
          hydrationData: {},
          window: getWindow("/"),
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Layout() {
        let navigate = useNavigate();
        let submit = useSubmit();
        let formData = new FormData();
        formData.append("test", "value");
        return (
          <>
            <button
              onClick={() => submit(formData, { action: "1", method: "get" })}
            >
              Submit
            </button>
            <button onClick={() => navigate(-1)}>Go back</button>
            <div className="output">
              <Outlet />
            </div>
          </>
        );
      }

      expect(getHtml(container.querySelector(".output")!))
        .toMatchInlineSnapshot(`
        "<div
          class="output"
        >
          <h1>
            index
          </h1>
        </div>"
      `);

      fireEvent.click(screen.getByText("Submit"));
      await waitFor(() => screen.getByText("Page 1"));
      expect(getHtml(container.querySelector(".output")!))
        .toMatchInlineSnapshot(`
        "<div
          class="output"
        >
          <h1>
            Page 1
          </h1>
        </div>"
      `);

      fireEvent.click(screen.getByText("Go back"));
      await waitFor(() => screen.getByText("index"));
      expect(getHtml(container.querySelector(".output")!))
        .toMatchInlineSnapshot(`
        "<div
          class="output"
        >
          <h1>
            index
          </h1>
        </div>"
      `);
    });

    it('defaults useSubmit({ method: "post" }) to a new location to be a PUSH navigation', async () => {
      let router = createTestRouter(
        createRoutesFromElements(
          <Route element={<Layout />}>
            <Route index loader={() => "index"} element={<h1>index</h1>} />
            <Route path="1" loader={() => "1"} element={<h1>Page 1</h1>} />
            <Route
              path="2"
              action={() => "action"}
              loader={() => "2"}
              element={<h1>Page 2</h1>}
            />
          </Route>
        ),
        {
          hydrationData: {},
          window: getWindow("/"),
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Layout() {
        let navigate = useNavigate();
        let submit = useSubmit();
        let formData = new FormData();
        formData.append("test", "value");
        return (
          <>
            <Link to="1">Go to 1</Link>
            <button
              onClick={() => {
                submit(formData, { action: "2", method: "post" });
              }}
            >
              Submit
            </button>
            <button onClick={() => navigate(-1)}>Go back</button>
            <div className="output">
              <Outlet />
            </div>
          </>
        );
      }

      expect(getHtml(container.querySelector(".output")!))
        .toMatchInlineSnapshot(`
        "<div
          class="output"
        >
          <h1>
            index
          </h1>
        </div>"
      `);

      fireEvent.click(screen.getByText("Go to 1"));
      await waitFor(() => screen.getByText("Page 1"));
      expect(getHtml(container.querySelector(".output")!))
        .toMatchInlineSnapshot(`
        "<div
          class="output"
        >
          <h1>
            Page 1
          </h1>
        </div>"
      `);

      fireEvent.click(screen.getByText("Submit"));
      await waitFor(() => screen.getByText("Page 2"));
      expect(getHtml(container.querySelector(".output")!))
        .toMatchInlineSnapshot(`
        "<div
          class="output"
        >
          <h1>
            Page 2
          </h1>
        </div>"
      `);

      fireEvent.click(screen.getByText("Go back"));
      await waitFor(() => screen.getByText("Page 1"));
      expect(getHtml(container.querySelector(".output")!))
        .toMatchInlineSnapshot(`
        "<div
          class="output"
        >
          <h1>
            Page 1
          </h1>
        </div>"
      `);
    });

    it('defaults useSubmit({ method: "post" }) to the same location to be a REPLACE navigation', async () => {
      let router = createTestRouter(
        createRoutesFromElements(
          <Route element={<Layout />}>
            <Route index loader={() => "index"} element={<h1>index</h1>} />
            <Route
              path="1"
              action={() => "action"}
              loader={() => "1"}
              element={<h1>Page 1</h1>}
            />
          </Route>
        ),
        {
          hydrationData: {},
          window: getWindow("/"),
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Layout() {
        let navigate = useNavigate();
        let submit = useSubmit();
        let actionData = useActionData() as string | undefined;
        let formData = new FormData();
        formData.append("test", "value");
        return (
          <>
            <Link to="1">Go to 1</Link>
            <button
              onClick={() => {
                submit(formData, { action: "1", method: "post" });
              }}
            >
              Submit
            </button>
            <button onClick={() => navigate(-1)}>Go back</button>
            <div className="output">
              {actionData ? <p>{actionData}</p> : null}
              <Outlet />
            </div>
          </>
        );
      }

      expect(getHtml(container.querySelector(".output")!))
        .toMatchInlineSnapshot(`
        "<div
          class="output"
        >
          <h1>
            index
          </h1>
        </div>"
      `);

      fireEvent.click(screen.getByText("Go to 1"));
      await waitFor(() => screen.getByText("Page 1"));
      expect(getHtml(container.querySelector(".output")!))
        .toMatchInlineSnapshot(`
        "<div
          class="output"
        >
          <h1>
            Page 1
          </h1>
        </div>"
      `);

      fireEvent.click(screen.getByText("Submit"));
      await waitFor(() => screen.getByText("action"));
      expect(getHtml(container.querySelector(".output")!))
        .toMatchInlineSnapshot(`
        "<div
          class="output"
        >
          <p>
            action
          </p>
          <h1>
            Page 1
          </h1>
        </div>"
      `);

      fireEvent.click(screen.getByText("Go back"));
      await waitFor(() => screen.getByText("index"));
      expect(getHtml(container.querySelector(".output")!))
        .toMatchInlineSnapshot(`
        "<div
          class="output"
        >
          <h1>
            index
          </h1>
        </div>"
      `);
    });

    it("allows direct actions to be passed to useSubmit", async () => {
      let router = createTestRouter(
        [
          {
            path: "/",
            Component() {
              let actionData = useActionData() as string | undefined;
              let submit = useSubmit();
              return (
                <>
                  <button
                    onClick={() =>
                      submit(new FormData(), {
                        method: "post",
                        action: () => "ACTION",
                      })
                    }
                  >
                    Submit
                  </button>
                  <p>{actionData || "empty"}</p>
                </>
              );
            },
          },
        ],
        {
          window: getWindow("/"),
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      expect(getHtml(container)).toMatch("empty");

      fireEvent.click(screen.getByText("Submit"));
      await waitFor(() => screen.getByText("ACTION"));
      expect(getHtml(container)).toMatch("ACTION");
    });

    it("allows direct actions to override the current route action", async () => {
      let router = createTestRouter(
        [
          {
            path: "/",
            action: () => "ACTION ROUTE",
            Component() {
              let actionData = useActionData() as string | undefined;
              let submit = useSubmit();
              return (
                <>
                  <button
                    onClick={() =>
                      submit(new FormData(), {
                        method: "post",
                      })
                    }
                  >
                    Submit Route
                  </button>
                  <button
                    onClick={() =>
                      submit(new FormData(), {
                        method: "post",
                        action: () => "ACTION OVERRIDE",
                      })
                    }
                  >
                    Submit Override
                  </button>
                  <p>{actionData || "empty"}</p>
                </>
              );
            },
          },
        ],
        {
          window: getWindow("/"),
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      expect(getHtml(container)).toMatch("empty");

      fireEvent.click(screen.getByText("Submit Route"));
      await waitFor(() => screen.getByText("ACTION ROUTE"));
      expect(getHtml(container)).toMatch("ACTION ROUTE");

      fireEvent.click(screen.getByText("Submit Override"));
      await waitFor(() => screen.getByText("ACTION OVERRIDE"));
      expect(getHtml(container)).toMatch("ACTION OVERRIDE");
    });

    it('supports a basename on <Form method="get">', async () => {
      let testWindow = getWindow("/base/path");
      let router = createTestRouter(
        createRoutesFromElements(<Route path="path" element={<Comp />} />),
        { basename: "/base", hydrationData: {}, window: testWindow }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Comp() {
        let location = useLocation();
        return (
          <Form>
            <p>{location.pathname + location.search}</p>
            <input name="a" defaultValue="1" />
            <button type="submit" name="b" value="2">
              Submit
            </button>
          </Form>
        );
      }

      assertLocation(testWindow, "/base/path");
      expect(getHtml(container)).toMatchInlineSnapshot(`
        "<div>
          <form
            action="/base/path"
            method="get"
          >
            <p>
              /path
            </p>
            <input
              name="a"
              value="1"
            />
            <button
              name="b"
              type="submit"
              value="2"
            >
              Submit
            </button>
          </form>
        </div>"
      `);

      fireEvent.click(screen.getByText("Submit"));
      assertLocation(testWindow, "/base/path", "?a=1&b=2");
      expect(getHtml(container)).toMatchInlineSnapshot(`
        "<div>
          <form
            action="/base/path?a=1&b=2"
            method="get"
          >
            <p>
              /path?a=1&b=2
            </p>
            <input
              name="a"
              value="1"
            />
            <button
              name="b"
              type="submit"
              value="2"
            >
              Submit
            </button>
          </form>
        </div>"
      `);
    });

    it('supports a basename on <Form method="post">', async () => {
      let testWindow = getWindow("/base/path");
      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="path" action={() => "action data"} element={<Comp />} />
        ),
        {
          basename: "/base",
          hydrationData: {},
          window: testWindow,
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Comp() {
        let location = useLocation();
        let data = useActionData() as string | undefined;
        return (
          <Form method="post">
            <p>{location.pathname + location.search}</p>
            {data && <p>{data}</p>}
            <input name="a" defaultValue="1" />
            <button type="submit" name="b" value="2">
              Submit
            </button>
          </Form>
        );
      }

      assertLocation(testWindow, "/base/path");
      expect(getHtml(container)).toMatchInlineSnapshot(`
        "<div>
          <form
            action="/base/path"
            method="post"
          >
            <p>
              /path
            </p>
            <input
              name="a"
              value="1"
            />
            <button
              name="b"
              type="submit"
              value="2"
            >
              Submit
            </button>
          </form>
        </div>"
      `);

      fireEvent.click(screen.getByText("Submit"));
      await waitFor(() => screen.getByText("action data"));
      assertLocation(testWindow, "/base/path");
      expect(getHtml(container)).toMatchInlineSnapshot(`
        "<div>
          <form
            action="/base/path"
            method="post"
          >
            <p>
              /path
            </p>
            <p>
              action data
            </p>
            <input
              name="a"
              value="1"
            />
            <button
              name="b"
              type="submit"
              value="2"
            >
              Submit
            </button>
          </form>
        </div>"
      `);
    });

    it("allows a button to override the <form method>", async () => {
      let loaderDefer = createDeferred();

      let router = createTestRouter(
        createRoutesFromElements(
          <Route
            path="/"
            action={async ({ request }) => {
              throw new Error("Should not hit this");
            }}
            loader={() => loaderDefer.promise}
            element={<Home />}
          />
        ),
        {
          hydrationData: {},
          window: getWindow("/"),
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Home() {
        let data = useLoaderData() as string;
        let navigation = useNavigation();
        return (
          <div>
            <Form method="post">
              <input name="test" value="value" />
              <button type="submit" formMethod="get">
                Submit Form
              </button>
            </Form>
            <div id="output">
              <p>{navigation.state}</p>
              <p>{data}</p>
            </div>
            <Outlet />
          </div>
        );
      }

      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            idle
          </p>
          <p />
        </div>"
      `);

      fireEvent.click(screen.getByText("Submit Form"));
      await waitFor(() => screen.getByText("loading"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            loading
          </p>
          <p />
        </div>"
      `);

      loaderDefer.resolve("Loader Data");
      await waitFor(() => screen.getByText("idle"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            idle
          </p>
          <p>
            Loader Data
          </p>
        </div>"
      `);
    });

    it("allows a button to override the <form action>", async () => {
      let router = createTestRouter(
        createRoutesFromElements(
          <Route path="/">
            <Route
              path="foo"
              action={() => {
                throw new Error("No");
              }}
            >
              <Route
                path="bar"
                action={() => "Yes"}
                Component={() => {
                  let actionData = useActionData() as string | undefined;
                  return (
                    <Form method="post" action="/foo">
                      <p>{actionData || "No"}</p>
                      <button type="submit" formAction="/foo/bar">
                        Submit
                      </button>
                    </Form>
                  );
                }}
              />
            </Route>
          </Route>
        ),
        {
          window: getWindow("/foo/bar"),
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      expect(container.querySelector("form")?.getAttribute("action")).toBe(
        "/foo"
      );
      expect(
        container.querySelector("button")?.getAttribute("formaction")
      ).toBe("/foo/bar");

      fireEvent.click(screen.getByText("Submit"));
      await waitFor(() => screen.getByText("Yes"));
      expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <form
              action="/foo"
              method="post"
            >
              <p>
                Yes
              </p>
              <button
                formaction="/foo/bar"
                type="submit"
              >
                Submit
              </button>
            </form>
          </div>"
        `);
    });

    it("supports uppercase form method attributes", async () => {
      let loaderDefer = createDeferred();
      let actionDefer = createDeferred();

      let router = createTestRouter(
        createRoutesFromElements(
          <Route
            path="/"
            action={async ({ request }) => {
              let resolvedValue = await actionDefer.promise;
              let formData = await request.formData();
              return `${resolvedValue}:${formData.get("test")}`;
            }}
            loader={() => loaderDefer.promise}
            element={<Home />}
          />
        ),
        {
          hydrationData: {},
          window: getWindow("/"),
        }
      );
      let { container } = render(<RouterProvider router={router} />);

      function Home() {
        let data = useLoaderData() as string;
        let actionData = useActionData() as string | undefined;
        let navigation = useNavigation();
        return (
          <div>
            <Form method="post">
              <input name="test" value="value" />
              <button type="submit">Submit Form</button>
            </Form>
            <div id="output">
              <p>{navigation.state}</p>
              <p>{data}</p>
              <p>{actionData}</p>
            </div>
            <Outlet />
          </div>
        );
      }

      fireEvent.click(screen.getByText("Submit Form"));
      await waitFor(() => screen.getByText("submitting"));
      actionDefer.resolve("Action Data");
      await waitFor(() => screen.getByText("loading"));
      loaderDefer.resolve("Loader Data");
      await waitFor(() => screen.getByText("idle"));
      expect(getHtml(container.querySelector("#output")!))
        .toMatchInlineSnapshot(`
        "<div
          id="output"
        >
          <p>
            idle
          </p>
          <p>
            Loader Data
          </p>
          <p>
            Action Data:value
          </p>
        </div>"
      `);
    });

    describe("<Form action>", () => {
      function NoActionComponent() {
        return (
          <Form method="post">
            <input name="b" value="2" />
            <button type="submit">Submit Form</button>
          </Form>
        );
      }

      function ActionDotComponent() {
        return (
          <Form method="post" action=".">
            <input name="b" value="2" />
            <button type="submit">Submit Form</button>
          </Form>
        );
      }

      function ActionEmptyComponent() {
        return (
          <Form method="post" action="">
            <input name="b" value="2" />
            <button type="submit">Submit Form</button>
          </Form>
        );
      }

      describe("static routes", () => {
        it("includes search params + hash when no action is specified", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="foo">
                  <Route path="bar" element={<NoActionComponent />} />
                </Route>
              </Route>
            ),
            {
              window: getWindow("/foo/bar?a=1#hash"),
            }
          );
          let { container } = render(<RouterProvider router={router} />);

          expect(container.querySelector("form")?.getAttribute("action")).toBe(
            "/foo/bar?a=1#hash"
          );
        });

        it("does not include search params + hash when action='.'", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="foo">
                  <Route path="bar" element={<ActionDotComponent />} />
                </Route>
              </Route>
            ),
            { window: getWindow("/foo/bar?a=1#hash") }
          );
          let { container } = render(<RouterProvider router={router} />);

          expect(container.querySelector("form")?.getAttribute("action")).toBe(
            "/foo/bar"
          );
        });

        it("does not include search params + hash when action=''", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="foo">
                  <Route path="bar" element={<ActionEmptyComponent />} />
                </Route>
              </Route>
            ),
            { window: getWindow("/foo/bar?a=1#hash") }
          );
          let { container } = render(<RouterProvider router={router} />);

          expect(container.querySelector("form")?.getAttribute("action")).toBe(
            "/foo/bar"
          );
        });
      });

      describe("layout routes", () => {
        it("includes search params + hash when no action is specified", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="foo">
                  <Route path="bar" element={<NoActionComponent />}>
                    <Route index={true} element={<h1>Index</h1>} />
                  </Route>
                </Route>
              </Route>
            ),
            {
              window: getWindow("/foo/bar?a=1#hash"),
            }
          );
          let { container } = render(<RouterProvider router={router} />);

          expect(container.querySelector("form")?.getAttribute("action")).toBe(
            "/foo/bar?a=1#hash"
          );
        });

        it("does not include search params + hash when action='.'", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="foo">
                  <Route path="bar" element={<ActionDotComponent />}>
                    <Route index={true} element={<h1>Index</h1>} />
                  </Route>
                </Route>
              </Route>
            ),
            {
              window: getWindow("/foo/bar?a=1#hash"),
            }
          );
          let { container } = render(<RouterProvider router={router} />);

          expect(container.querySelector("form")?.getAttribute("action")).toBe(
            "/foo/bar"
          );
        });

        it("does not include search params + hash when action=''", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="foo">
                  <Route path="bar" element={<ActionEmptyComponent />}>
                    <Route index={true} element={<h1>Index</h1>} />
                  </Route>
                </Route>
              </Route>
            ),
            {
              window: getWindow("/foo/bar?a=1#hash"),
            }
          );
          let { container } = render(<RouterProvider router={router} />);

          expect(container.querySelector("form")?.getAttribute("action")).toBe(
            "/foo/bar"
          );
        });
      });

      describe("index routes", () => {
        it("includes search params + hash when no action is specified", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="foo">
                  <Route path="bar">
                    <Route index={true} element={<NoActionComponent />} />
                  </Route>
                </Route>
              </Route>
            ),
            {
              window: getWindow("/foo/bar?a=1#hash"),
            }
          );
          let { container } = render(<RouterProvider router={router} />);

          expect(container.querySelector("form")?.getAttribute("action")).toBe(
            "/foo/bar?index&a=1#hash"
          );
        });

        it("does not include search params + hash action='.'", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="foo">
                  <Route path="bar">
                    <Route index={true} element={<ActionDotComponent />} />
                  </Route>
                </Route>
              </Route>
            ),
            {
              window: getWindow("/foo/bar?a=1#hash"),
            }
          );
          let { container } = render(<RouterProvider router={router} />);

          expect(container.querySelector("form")?.getAttribute("action")).toBe(
            "/foo/bar?index"
          );
        });

        it("does not include search params + hash action=''", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="foo">
                  <Route path="bar">
                    <Route index={true} element={<ActionEmptyComponent />} />
                  </Route>
                </Route>
              </Route>
            ),
            {
              window: getWindow("/foo/bar?a=1#hash"),
            }
          );
          let { container } = render(<RouterProvider router={router} />);

          expect(container.querySelector("form")?.getAttribute("action")).toBe(
            "/foo/bar?index"
          );
        });

        // eslint-disable-next-line jest/expect-expect
        it("does not repeatedly add ?index params on submissions", async () => {
          let testWindow = getWindow("/form");
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="form">
                  <Route
                    index={true}
                    action={() => ({})}
                    element={
                      <Form method="post">
                        <button type="submit" name="name" value="value">
                          Submit
                        </button>
                      </Form>
                    }
                  />
                </Route>
              </Route>
            ),
            {
              window: testWindow,
            }
          );
          render(<RouterProvider router={router} />);

          assertLocation(testWindow, "/form", "");

          fireEvent.click(screen.getByText("Submit"));
          await new Promise((r) => setTimeout(r, 0));
          assertLocation(testWindow, "/form", "?index");

          fireEvent.click(screen.getByText("Submit"));
          await new Promise((r) => setTimeout(r, 0));
          assertLocation(testWindow, "/form", "?index");
        });

        it("handles index routes with a path", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="foo">
                  <Route
                    index={true}
                    path="bar"
                    element={<NoActionComponent />}
                  />
                </Route>
              </Route>
            ),
            { window: getWindow("/foo/bar?a=1#hash") }
          );
          let { container } = render(<RouterProvider router={router} />);

          expect(container.querySelector("form")?.getAttribute("action")).toBe(
            "/foo/bar?index&a=1#hash"
          );
        });

        // eslint-disable-next-line jest/expect-expect
        it('does not put ?index param in final URL for <Form method="get"', async () => {
          let testWindow = getWindow("/form");
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="form">
                  <Route
                    index={true}
                    element={
                      <Form>
                        <button type="submit" name="name" value="value">
                          Submit
                        </button>
                      </Form>
                    }
                  />
                </Route>
              </Route>
            ),
            {
              window: testWindow,
            }
          );
          render(<RouterProvider router={router} />);

          assertLocation(testWindow, "/form", "");

          fireEvent.click(screen.getByText("Submit"));
          await new Promise((r) => setTimeout(r, 0));
          assertLocation(testWindow, "/form", "?name=value");
        });
      });

      describe("dynamic routes", () => {
        it("includes search params + hash when no action is specified", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="foo">
                  <Route path=":param" element={<NoActionComponent />} />
                </Route>
              </Route>
            ),
            {
              window: getWindow("/foo/bar?a=1#hash"),
            }
          );
          let { container } = render(<RouterProvider router={router} />);

          expect(container.querySelector("form")?.getAttribute("action")).toBe(
            "/foo/bar?a=1#hash"
          );
        });

        it("does not include search params + hash action='.'", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="foo">
                  <Route path=":param" element={<ActionDotComponent />} />
                </Route>
              </Route>
            ),
            {
              window: getWindow("/foo/bar?a=1#hash"),
            }
          );
          let { container } = render(<RouterProvider router={router} />);

          expect(container.querySelector("form")?.getAttribute("action")).toBe(
            "/foo/bar"
          );
        });

        it("does not include search params + hash when action=''", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="foo">
                  <Route path=":param" element={<ActionEmptyComponent />} />
                </Route>
              </Route>
            ),
            {
              window: getWindow("/foo/bar?a=1#hash"),
            }
          );
          let { container } = render(<RouterProvider router={router} />);

          expect(container.querySelector("form")?.getAttribute("action")).toBe(
            "/foo/bar"
          );
        });
      });

      describe("splat routes", () => {
        it("includes search params + hash when no action is specified", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="foo">
                  <Route path="*" element={<NoActionComponent />} />
                </Route>
              </Route>
            ),
            {
              window: getWindow("/foo/bar?a=1#hash"),
            }
          );
          let { container } = render(<RouterProvider router={router} />);

          expect(container.querySelector("form")?.getAttribute("action")).toBe(
            "/foo?a=1#hash"
          );
        });

        it("does not include search params + hash when action='.'", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="foo">
                  <Route path="*" element={<ActionDotComponent />} />
                </Route>
              </Route>
            ),
            {
              window: getWindow("/foo/bar?a=1#hash"),
            }
          );
          let { container } = render(<RouterProvider router={router} />);

          expect(container.querySelector("form")?.getAttribute("action")).toBe(
            "/foo"
          );
        });

        it("does not include search params + hash when action=''", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/">
                <Route path="foo">
                  <Route path="*" element={<ActionEmptyComponent />} />
                </Route>
              </Route>
            ),
            {
              window: getWindow("/foo/bar?a=1#hash"),
            }
          );
          let { container } = render(<RouterProvider router={router} />);

          expect(container.querySelector("form")?.getAttribute("action")).toBe(
            "/foo"
          );
        });
      });
    });

    describe('<Form action relative="path">', () => {
      it("navigates relative to the URL for static routes", async () => {
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="inbox">
              <Route path="messages" />
              <Route
                path="messages/edit"
                element={<Form action=".." relative="path" />}
              />
            </Route>
          ),
          {
            window: getWindow("/inbox/messages/edit"),
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        expect(container.querySelector("form")?.getAttribute("action")).toBe(
          "/inbox/messages"
        );
      });

      it("navigates relative to the URL for dynamic routes", async () => {
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="inbox">
              <Route path="messages" />
              <Route
                path="messages/:id"
                element={<Form action=".." relative="path" />}
              />
            </Route>
          ),
          {
            window: getWindow("/inbox/messages/1"),
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        expect(container.querySelector("form")?.getAttribute("action")).toBe(
          "/inbox/messages"
        );
      });

      it("navigates relative to the URL for layout routes", async () => {
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="inbox">
              <Route path="messages" />
              <Route
                path="messages/:id"
                element={
                  <>
                    <Form action=".." relative="path" />
                    <Outlet />
                  </>
                }
              >
                <Route index element={<h1>Form</h1>} />
              </Route>
            </Route>
          ),
          {
            window: getWindow("/inbox/messages/1"),
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        expect(container.querySelector("form")?.getAttribute("action")).toBe(
          "/inbox/messages"
        );
      });

      it("navigates relative to the URL for index routes", async () => {
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="inbox">
              <Route path="messages" />
              <Route path="messages/:id">
                <Route index element={<Form action=".." relative="path" />} />
              </Route>
            </Route>
          ),
          {
            window: getWindow("/inbox/messages/1"),
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        expect(container.querySelector("form")?.getAttribute("action")).toBe(
          "/inbox/messages"
        );
      });

      it("navigates relative to the URL for splat routes", async () => {
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="inbox">
              <Route path="messages" />
              <Route
                path="messages/*"
                element={<Form action=".." relative="path" />}
              />
            </Route>
          ),
          {
            window: getWindow("/inbox/messages/1/2/3"),
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        expect(container.querySelector("form")?.getAttribute("action")).toBe(
          "/inbox/messages/1/2"
        );
      });
    });

    describe("useSubmit/Form FormData", () => {
      it("gathers form data on <Form> submissions", async () => {
        let actionSpy = jest.fn();
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" action={actionSpy} element={<FormPage />} />
          ),
          { window: getWindow("/") }
        );
        render(<RouterProvider router={router} />);

        function FormPage() {
          return (
            <Form method="post">
              <input name="a" defaultValue="1" />
              <input name="b" defaultValue="2" />
              <button type="submit">Submit</button>
            </Form>
          );
        }

        fireEvent.click(screen.getByText("Submit"));
        let formData = await actionSpy.mock.calls[0][0].request.formData();
        expect(formData.get("a")).toBe("1");
        expect(formData.get("b")).toBe("2");
      });

      it("gathers form data on submit(form) submissions", async () => {
        let actionSpy = jest.fn();
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" action={actionSpy} element={<FormPage />} />
          ),
          { window: getWindow("/") }
        );
        render(<RouterProvider router={router} />);

        function FormPage() {
          let submit = useSubmit();
          let formRef = React.useRef(null);
          return (
            <>
              <Form method="post" ref={formRef}>
                <input name="a" defaultValue="1" />
                <input name="b" defaultValue="2" />
              </Form>
              <button onClick={() => submit(formRef.current)}>Submit</button>
            </>
          );
        }

        fireEvent.click(screen.getByText("Submit"));
        let formData = await actionSpy.mock.calls[0][0].request.formData();
        expect(formData.get("a")).toBe("1");
        expect(formData.get("b")).toBe("2");
      });

      it("gathers form data on submit(button) submissions", async () => {
        let actionSpy = jest.fn();
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" action={actionSpy} element={<FormPage />} />
          ),
          { window: getWindow("/") }
        );
        render(<RouterProvider router={router} />);

        function FormPage() {
          let submit = useSubmit();
          return (
            <>
              <Form method="post">
                <input name="a" defaultValue="1" />
                <input name="b" defaultValue="2" />
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    submit(e.currentTarget);
                  }}
                >
                  Submit
                </button>
              </Form>
            </>
          );
        }

        fireEvent.click(screen.getByText("Submit"));
        let formData = await actionSpy.mock.calls[0][0].request.formData();
        expect(formData.get("a")).toBe("1");
        expect(formData.get("b")).toBe("2");
      });

      it("gathers form data on submit(input[type=submit]) submissions", async () => {
        let actionSpy = jest.fn();
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" action={actionSpy} element={<FormPage />} />
          ),
          { window: getWindow("/") }
        );
        render(<RouterProvider router={router} />);

        function FormPage() {
          let submit = useSubmit();
          return (
            <>
              <Form method="post">
                <input name="a" defaultValue="1" />
                <input name="b" defaultValue="2" />
                <input
                  type="submit"
                  value="Submit"
                  onClick={(e) => {
                    e.preventDefault();
                    submit(e.currentTarget);
                  }}
                />
              </Form>
            </>
          );
        }

        fireEvent.click(screen.getByText("Submit"));
        let formData = await actionSpy.mock.calls[0][0].request.formData();
        expect(formData.get("a")).toBe("1");
        expect(formData.get("b")).toBe("2");
      });

      it("gathers form data on submit(FormData) submissions", async () => {
        let actionSpy = jest.fn();
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" action={actionSpy} element={<FormPage />} />
          ),
          { window: getWindow("/") }
        );
        render(<RouterProvider router={router} />);

        function FormPage() {
          let submit = useSubmit();
          let formData = new FormData();
          formData.set("a", "1");
          formData.set("b", "2");
          return (
            <button onClick={() => submit(formData, { method: "post" })}>
              Submit
            </button>
          );
        }

        fireEvent.click(screen.getByText("Submit"));
        let formData = await actionSpy.mock.calls[0][0].request.formData();
        expect(formData.get("a")).toBe("1");
        expect(formData.get("b")).toBe("2");
      });

      it("serializes formData on submit(object) submissions", async () => {
        let actionSpy = jest.fn();
        let payload = { a: "1", b: "2" };
        let router = createTestRouter(
          [
            {
              path: "/",
              action: actionSpy,
              Component() {
                let submit = useSubmit();
                return (
                  <button onClick={() => submit(payload, { method: "post" })}>
                    Submit
                  </button>
                );
              },
            },
          ],
          { window: getWindow("/") }
        );
        render(<RouterProvider router={router} />);

        fireEvent.click(screen.getByText("Submit"));
        let formData = await actionSpy.mock.calls[0][0].request.formData();
        expect(formData.get("a")).toBe("1");
        expect(formData.get("b")).toBe("2");
        expect(actionSpy.mock.calls[0][0].payload).toBe(undefined);
      });

      it("serializes formData on submit(object)/encType:application/x-www-form-urlencoded submissions", async () => {
        let actionSpy = jest.fn();
        let payload = { a: "1", b: "2" };
        let router = createTestRouter(
          [
            {
              path: "/",
              action: actionSpy,
              Component() {
                let submit = useSubmit();
                return (
                  <button
                    onClick={() =>
                      submit(payload, {
                        method: "post",
                        encType: "application/x-www-form-urlencoded",
                      })
                    }
                  >
                    Submit
                  </button>
                );
              },
            },
          ],
          { window: getWindow("/") }
        );
        render(<RouterProvider router={router} />);

        fireEvent.click(screen.getByText("Submit"));
        let request = actionSpy.mock.calls[0][0].request;
        expect(request.headers.get("Content-Type")).toBe(
          "application/x-www-form-urlencoded;charset=UTF-8"
        );
        let formData = await request.formData();
        expect(formData.get("a")).toBe("1");
        expect(formData.get("b")).toBe("2");
        expect(actionSpy.mock.calls[0][0].payload).toBe(undefined);
      });

      it("serializes JSON on submit(object)/encType:application/json submissions", async () => {
        let actionSpy = jest.fn();
        let payload = { a: "1", b: "2" };
        let router = createTestRouter(
          [
            {
              path: "/",
              action: actionSpy,
              Component() {
                let submit = useSubmit();
                return (
                  <button
                    onClick={() =>
                      submit(payload, {
                        method: "post",
                        encType: "application/json",
                      })
                    }
                  >
                    Submit
                  </button>
                );
              },
            },
          ],
          { window: getWindow("/") }
        );
        render(<RouterProvider router={router} />);

        fireEvent.click(screen.getByText("Submit"));
        let request = actionSpy.mock.calls[0][0].request;
        expect(request.headers.get("Content-Type")).toBe("application/json");
        expect(await request.json()).toEqual({ a: "1", b: "2" });
        expect(actionSpy.mock.calls[0][0].payload).toBe(payload);
      });

      it("serializes text on submit(object)/encType:text/plain submissions", async () => {
        let actionSpy = jest.fn();
        let payload = "look ma, no formData!";
        let router = createTestRouter(
          [
            {
              path: "/",
              action: actionSpy,
              Component() {
                let submit = useSubmit();
                return (
                  <button
                    onClick={() =>
                      submit(payload, {
                        method: "post",
                        encType: "text/plain",
                      })
                    }
                  >
                    Submit
                  </button>
                );
              },
            },
          ],
          { window: getWindow("/") }
        );
        render(<RouterProvider router={router} />);

        fireEvent.click(screen.getByText("Submit"));
        let request = actionSpy.mock.calls[0][0].request;
        expect(request.headers.get("Content-Type")).toBe("text/plain");
        expect(await request.text()).toEqual(payload);
        expect(actionSpy.mock.calls[0][0].payload).toBe(payload);
      });

      it("does not serialize formData on submit(object)/encType:null submissions", async () => {
        let actionSpy = jest.fn();
        let payload;
        let router = createTestRouter(
          [
            {
              path: "/",
              action: actionSpy,
              Component() {
                let submit = useSubmit();
                return (
                  <button
                    onClick={() =>
                      submit(payload, { method: "post", encType: null })
                    }
                  >
                    Submit
                  </button>
                );
              },
            },
          ],
          { window: getWindow("/") }
        );
        render(<RouterProvider router={router} />);

        payload = "look ma no formData!";
        fireEvent.click(screen.getByText("Submit"));
        expect(actionSpy.mock.calls[0][0].request.body).toBe(null);
        expect(actionSpy.mock.calls[0][0].payload).toBe(payload);
        actionSpy.mockReset();

        payload = { a: "1", b: "2" };
        fireEvent.click(screen.getByText("Submit"));
        expect(actionSpy.mock.calls[0][0].request.body).toBe(null);
        expect(actionSpy.mock.calls[0][0].payload).toBe(payload);
        actionSpy.mockReset();

        payload = [1, 2, 3, 4, 5];
        fireEvent.click(screen.getByText("Submit"));
        expect(actionSpy.mock.calls[0][0].request.body).toBe(null);
        expect(actionSpy.mock.calls[0][0].payload).toBe(payload);
        actionSpy.mockReset();

        router.dispose();
      });

      it("includes submit button name/value on form submission", async () => {
        let actionSpy = jest.fn();
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" action={actionSpy} element={<FormPage />} />
          ),
          { window: getWindow("/") }
        );
        render(<RouterProvider router={router} />);

        function FormPage() {
          return (
            <Form method="post">
              <input name="a" defaultValue="1" />
              <input name="b" defaultValue="2" />
              <button name="c" value="3" type="submit">
                Submit
              </button>
            </Form>
          );
        }

        fireEvent.click(screen.getByText("Submit"));
        let formData = await actionSpy.mock.calls[0][0].request.formData();
        expect(formData.get("a")).toBe("1");
        expect(formData.get("b")).toBe("2");
        expect(formData.get("c")).toBe("3");
      });

      it("includes submit button name/value on button submission", async () => {
        let actionSpy = jest.fn();
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" action={actionSpy} element={<FormPage />} />
          ),
          { window: getWindow("/") }
        );
        render(<RouterProvider router={router} />);

        function FormPage() {
          let submit = useSubmit();
          return (
            <Form method="post">
              <input name="a" defaultValue="1" />
              <input name="b" defaultValue="2" />
              <button
                name="c"
                value="3"
                onClick={(e) => {
                  e.preventDefault();
                  submit(e.currentTarget);
                }}
              >
                Submit
              </button>
            </Form>
          );
        }

        fireEvent.click(screen.getByText("Submit"));
        let formData = await actionSpy.mock.calls[0][0].request.formData();
        expect(formData.get("a")).toBe("1");
        expect(formData.get("b")).toBe("2");
        expect(formData.get("c")).toBe("3");
      });

      it("appends button name/value and doesn't overwrite inputs with same name (form)", async () => {
        let actionSpy = jest.fn();
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" action={actionSpy} element={<FormPage />} />
          ),
          { window: getWindow("/") }
        );
        render(<RouterProvider router={router} />);

        function FormPage() {
          return (
            <Form method="post">
              <input name="a" defaultValue="1" />
              <input name="b" defaultValue="2" />
              <button name="b" value="3" type="submit">
                Submit
              </button>
            </Form>
          );
        }

        fireEvent.click(screen.getByText("Submit"));
        let formData = await actionSpy.mock.calls[0][0].request.formData();
        expect(formData.get("a")).toBe("1");
        expect(formData.getAll("b")).toEqual(["2", "3"]);
      });

      it("appends button name/value and doesn't overwrite inputs with same name (button)", async () => {
        let actionSpy = jest.fn();
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" action={actionSpy} element={<FormPage />} />
          ),
          { window: getWindow("/") }
        );
        render(<RouterProvider router={router} />);

        function FormPage() {
          let submit = useSubmit();
          return (
            <Form method="post">
              <input name="a" defaultValue="1" />
              <input name="b" defaultValue="2" />
              <button
                name="b"
                value="3"
                onClick={(e) => {
                  e.preventDefault();
                  submit(e.currentTarget);
                }}
              >
                Submit
              </button>
            </Form>
          );
        }

        fireEvent.click(screen.getByText("Submit"));
        let formData = await actionSpy.mock.calls[0][0].request.formData();
        expect(formData.get("a")).toBe("1");
        expect(formData.getAll("b")).toEqual(["2", "3"]);
      });
    });

    describe("useFetcher(s)", () => {
      it("handles fetcher.load and fetcher.submit", async () => {
        let count = 0;
        let router = createTestRouter(
          createRoutesFromElements(
            <Route
              path="/"
              element={<Comp />}
              action={async ({ request }) => {
                let formData = await request.formData();
                count = count + parseInt(String(formData.get("increment")), 10);
                return { count };
              }}
              loader={async ({ request }) => {
                // Need to add a domain on here in node unit testing so it's a
                // valid URL. When running in the browser the domain is
                // automatically added in new Request()
                let increment =
                  new URL(`https://remix.test${request.url}`).searchParams.get(
                    "increment"
                  ) || "1";
                count = count + parseInt(increment, 10);
                return { count };
              }}
            />
          ),
          {
            window: getWindow("/"),
            hydrationData: { loaderData: { "0": null } },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Comp() {
          let fetcher = useFetcher();
          let fd = new FormData();
          fd.append("increment", "10");
          return (
            <>
              <p id="output">
                {fetcher.state}
                {fetcher.data ? JSON.stringify(fetcher.data) : null}
              </p>
              <button onClick={() => fetcher.load("/")}>load 1</button>
              <button onClick={() => fetcher.load("/?increment=5")}>
                load 5
              </button>
              <button onClick={() => fetcher.submit(fd, { method: "post" })}>
                submit 10
              </button>
            </>
          );
        }

        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            idle
          </p>"
        `);

        fireEvent.click(screen.getByText("load 1"));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            loading
          </p>"
        `);

        await waitFor(() => screen.getByText(/idle/));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            idle
            {"count":1}
          </p>"
        `);

        fireEvent.click(screen.getByText("load 5"));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            loading
            {"count":1}
          </p>"
        `);

        await waitFor(() => screen.getByText(/idle/));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            idle
            {"count":6}
          </p>"
        `);

        fireEvent.click(screen.getByText("submit 10"));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            submitting
            {"count":6}
          </p>"
        `);

        await waitFor(() => screen.getByText(/idle/));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            idle
            {"count":16}
          </p>"
        `);
      });

      it("handles fetcher ?index params", async () => {
        let router = createTestRouter(
          createRoutesFromElements(
            <Route
              path="/parent"
              element={<Outlet />}
              action={() => "PARENT ACTION"}
              loader={() => "PARENT LOADER"}
            >
              <Route
                index
                element={<Index />}
                action={() => "INDEX ACTION"}
                loader={() => "INDEX LOADER"}
              />
            </Route>
          ),
          {
            window: getWindow("/parent"),
            hydrationData: { loaderData: { parent: null, index: null } },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Index() {
          let fetcher = useFetcher();

          return (
            <>
              <p id="output">{fetcher.data}</p>
              <button onClick={() => fetcher.load("/parent")}>
                Load parent
              </button>
              <button onClick={() => fetcher.load("/parent?index")}>
                Load index
              </button>
              <button onClick={() => fetcher.submit({})}>Submit empty</button>
              <button
                onClick={() =>
                  fetcher.submit({}, { method: "get", action: "/parent" })
                }
              >
                Submit parent get
              </button>
              <button
                onClick={() =>
                  fetcher.submit({}, { method: "get", action: "/parent?index" })
                }
              >
                Submit index get
              </button>
              <button
                onClick={() =>
                  fetcher.submit({}, { method: "post", action: "/parent" })
                }
              >
                Submit parent post
              </button>
              <button
                onClick={() =>
                  fetcher.submit(
                    {},
                    { method: "post", action: "/parent?index" }
                  )
                }
              >
                Submit index post
              </button>
            </>
          );
        }

        async function clickAndAssert(btnText: string, expectedOutput: string) {
          fireEvent.click(screen.getByText(btnText));
          await new Promise((r) => setTimeout(r, 1));
          await waitFor(() => screen.getByText(new RegExp(expectedOutput)));
          expect(getHtml(container.querySelector("#output")!)).toContain(
            expectedOutput
          );
        }

        await clickAndAssert("Load parent", "PARENT LOADER");
        await clickAndAssert("Load index", "INDEX LOADER");
        await clickAndAssert("Submit empty", "INDEX LOADER");
        await clickAndAssert("Submit parent get", "PARENT LOADER");
        await clickAndAssert("Submit index get", "INDEX LOADER");
        await clickAndAssert("Submit parent post", "PARENT ACTION");
        await clickAndAssert("Submit index post", "INDEX ACTION");
      });

      it("handles fetcher.load errors", async () => {
        let router = createTestRouter(
          createRoutesFromElements(
            <Route
              path="/"
              element={<Comp />}
              errorElement={<ErrorElement />}
              loader={async () => {
                throw new Error("Kaboom!");
              }}
            />
          ),
          {
            window: getWindow("/"),
            hydrationData: { loaderData: { "0": null } },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Comp() {
          let fetcher = useFetcher();
          return (
            <>
              <p>
                {fetcher.state}
                {fetcher.data ? JSON.stringify(fetcher.data) : null}
              </p>
              <button onClick={() => fetcher.load("/")}>load</button>
            </>
          );
        }

        function ErrorElement() {
          let error = useRouteError() as Error;
          return <p>{error.message}</p>;
        }

        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <p>
              idle
            </p>
            <button>
              load
            </button>
          </div>"
        `);

        fireEvent.click(screen.getByText("load"));
        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <p>
              loading
            </p>
            <button>
              load
            </button>
          </div>"
        `);

        await waitFor(() => screen.getByText("Kaboom!"));
        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <p>
              Kaboom!
            </p>
          </div>"
        `);
      });

      it("handles fetcher.load errors (defer)", async () => {
        let dfd = createDeferred();
        let router = createTestRouter(
          createRoutesFromElements(
            <Route
              path="/"
              element={<Comp />}
              errorElement={<ErrorElement />}
              loader={() => defer({ value: dfd.promise })}
            />
          ),
          {
            window: getWindow("/"),
            hydrationData: { loaderData: { "0": null } },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Comp() {
          let fetcher = useFetcher();
          return (
            <>
              <p>
                {fetcher.state}
                {fetcher.data ? JSON.stringify(fetcher.data.value) : null}
              </p>
              <button onClick={() => fetcher.load("/")}>load</button>
            </>
          );
        }

        function ErrorElement() {
          let error = useRouteError() as Error;
          return <p>{error.message}</p>;
        }

        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <p>
              idle
            </p>
            <button>
              load
            </button>
          </div>"
        `);

        fireEvent.click(screen.getByText("load"));
        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <p>
              loading
            </p>
            <button>
              load
            </button>
          </div>"
        `);

        dfd.reject(new Error("Kaboom!"));
        await waitFor(() => screen.getByText("Kaboom!"));
        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <p>
              Kaboom!
            </p>
          </div>"
        `);
      });

      it("handles fetcher.submit errors", async () => {
        let router = createTestRouter(
          createRoutesFromElements(
            <Route
              path="/"
              element={<Comp />}
              errorElement={<ErrorElement />}
              action={async () => {
                throw new Error("Kaboom!");
              }}
            />
          ),
          {
            window: getWindow("/"),
            hydrationData: { loaderData: { "0": null } },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Comp() {
          let fetcher = useFetcher();
          return (
            <>
              <p>
                {fetcher.state}
                {fetcher.data ? JSON.stringify(fetcher.data) : null}
              </p>
              <button
                onClick={() =>
                  fetcher.submit(new FormData(), { method: "post" })
                }
              >
                submit
              </button>
            </>
          );
        }

        function ErrorElement() {
          let error = useRouteError() as Error;
          return <p>{error.message}</p>;
        }

        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <p>
              idle
            </p>
            <button>
              submit
            </button>
          </div>"
        `);

        fireEvent.click(screen.getByText("submit"));
        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <p>
              submitting
            </p>
            <button>
              submit
            </button>
          </div>"
        `);

        await waitFor(() => screen.getByText("Kaboom!"));
        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <p>
              Kaboom!
            </p>
          </div>"
        `);
      });

      it("handles fetcher.Form", async () => {
        let count = 0;
        let router = createTestRouter(
          createRoutesFromElements(
            <Route
              path="/"
              element={<Comp />}
              action={async ({ request }) => {
                let formData = await request.formData();
                count = count + parseInt(String(formData.get("increment")), 10);
                return { count };
              }}
              loader={async ({ request }) => {
                // Need to add a domain on here in node unit testing so it's a
                // valid URL. When running in the browser the domain is
                // automatically added in new Request()
                let increment =
                  new URL(`https://remix.test${request.url}`).searchParams.get(
                    "increment"
                  ) || "1";
                count = count + parseInt(increment, 10);
                return { count };
              }}
            />
          ),
          {
            window: getWindow("/"),
            hydrationData: { loaderData: { "0": null } },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Comp() {
          let fetcher = useFetcher();
          return (
            <>
              <p id="output">
                {fetcher.state}
                {fetcher.data ? JSON.stringify(fetcher.data) : null}
              </p>
              <fetcher.Form>
                <input name="increment" value="1" />
                <button type="submit">submit get 1</button>
              </fetcher.Form>
              <fetcher.Form method="post">
                <input name="increment" value="10" />
                <button type="submit">submit post 10</button>
              </fetcher.Form>
            </>
          );
        }

        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            idle
          </p>"
        `);

        fireEvent.click(screen.getByText("submit get 1"));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            loading
          </p>"
        `);

        await waitFor(() => screen.getByText(/idle/));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            idle
            {"count":1}
          </p>"
        `);

        fireEvent.click(screen.getByText("submit post 10"));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            submitting
            {"count":1}
          </p>"
        `);

        await waitFor(() => screen.getByText(/idle/));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            idle
            {"count":11}
          </p>"
        `);
      });

      it("handles fetcher.Form get errors", async () => {
        let router = createTestRouter(
          createRoutesFromElements(
            <Route
              path="/"
              element={<Comp />}
              errorElement={<ErrorElement />}
              loader={async () => {
                throw new Error("Kaboom!");
              }}
            />
          ),
          {
            window: getWindow("/"),
            hydrationData: { loaderData: { "0": null } },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Comp() {
          let fetcher = useFetcher();
          return (
            <>
              <p id="output">
                {fetcher.state}
                {fetcher.data ? JSON.stringify(fetcher.data) : null}
              </p>
              <fetcher.Form>
                <button type="submit">submit</button>
              </fetcher.Form>
            </>
          );
        }

        function ErrorElement() {
          let error = useRouteError() as Error;
          return <p>{error.message}</p>;
        }

        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            idle
          </p>"
        `);

        fireEvent.click(screen.getByText("submit"));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            loading
          </p>"
        `);

        await waitFor(() => screen.getByText("Kaboom!"));
        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <p>
              Kaboom!
            </p>
          </div>"
        `);
      });

      it("handles fetcher.Form post errors", async () => {
        let router = createTestRouter(
          createRoutesFromElements(
            <Route
              path="/"
              element={<Comp />}
              errorElement={<ErrorElement />}
              action={async () => {
                throw new Error("Kaboom!");
              }}
            />
          ),
          {
            window: getWindow("/"),
            hydrationData: { loaderData: { "0": null } },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Comp() {
          let fetcher = useFetcher();
          return (
            <>
              <p id="output">
                {fetcher.state}
                {fetcher.data ? JSON.stringify(fetcher.data) : null}
              </p>
              <fetcher.Form method="post">
                <button type="submit">submit</button>
              </fetcher.Form>
            </>
          );
        }

        function ErrorElement() {
          let error = useRouteError() as Error;
          return <p>{error.message}</p>;
        }

        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            idle
          </p>"
        `);

        fireEvent.click(screen.getByText("submit"));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            submitting
          </p>"
        `);

        await waitFor(() => screen.getByText("Kaboom!"));
        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <p>
              Kaboom!
            </p>
          </div>"
        `);
      });

      it("does not serialize fetcher.submit(object, { encType: null }) calls", async () => {
        let actionSpy = jest.fn();
        let payload = { key: "value" };
        let router = createTestRouter(
          [
            {
              path: "/",
              action: actionSpy,
              Component() {
                let fetcher = useFetcher();
                return (
                  <button
                    onClick={() =>
                      fetcher.submit(payload, {
                        method: "post",
                        encType: null,
                      })
                    }
                  >
                    Submit
                  </button>
                );
              },
            },
          ],
          {
            window: getWindow("/"),
          }
        );

        render(<RouterProvider router={router} />);
        fireEvent.click(screen.getByText("Submit"));
        expect(actionSpy.mock.calls[0][0].payload).toEqual(payload);
        expect(actionSpy.mock.calls[0][0].request.body).toBe(null);
      });

      it("show all fetchers via useFetchers and cleans up fetchers on unmount", async () => {
        let dfd1 = createDeferred();
        let dfd2 = createDeferred();
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" element={<Parent />}>
              <Route
                path="/1"
                loader={async () => await dfd1.promise}
                element={<Comp1 />}
              />
              <Route
                path="/2"
                loader={async () => await dfd2.promise}
                element={<Comp2 />}
              />
            </Route>
          ),
          {
            window: getWindow("/1"),
            hydrationData: { loaderData: { "0": null, "0-0": null } },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Parent() {
          let fetchers = useFetchers();
          return (
            <>
              <Link to="/1">Link to 1</Link>
              <Link to="/2">Link to 2</Link>
              <div id="output">
                <p>{JSON.stringify(fetchers.map((f) => f.state))}</p>
                <Outlet />
              </div>
            </>
          );
        }

        function Comp1() {
          let fetcher = useFetcher();
          return (
            <>
              <p>
                1{fetcher.state}
                {fetcher.data || "null"}
              </p>
              <button onClick={() => fetcher.load("/1")}>load</button>
            </>
          );
        }

        function Comp2() {
          let fetcher = useFetcher();
          return (
            <>
              <p>
                2{fetcher.state}
                {fetcher.data || "null"}
              </p>
              <button onClick={() => fetcher.load("/2")}>load</button>
            </>
          );
        }

        // Initial state - no useFetchers reflected yet
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              []
            </p>
            <p>
              1
              idle
              null
            </p>
            <button>
              load
            </button>
          </div>"
        `);

        // Activate Comp1 fetcher
        fireEvent.click(screen.getByText("load"));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              ["loading"]
            </p>
            <p>
              1
              loading
              null
            </p>
            <button>
              load
            </button>
          </div>"
        `);

        // Resolve Comp1 fetcher - UI updates
        dfd1.resolve("data 1");
        await waitFor(() => screen.getByText(/data 1/));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              ["idle"]
            </p>
            <p>
              1
              idle
              data 1
            </p>
            <button>
              load
            </button>
          </div>"
        `);

        // Link to Comp2 - loaders run
        fireEvent.click(screen.getByText("Link to 2"));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              ["idle"]
            </p>
            <p>
              1
              idle
              data 1
            </p>
            <button>
              load
            </button>
          </div>"
        `);

        // Resolve Comp2 loader and complete navigation - Comp1 fetcher is still
        // reflected here since deleteFetcher doesn't updateState
        // TODO: Is this expected?
        dfd2.resolve("data 2");
        await waitFor(() => screen.getByText(/2.*idle/));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              ["idle"]
            </p>
            <p>
              2
              idle
              null
            </p>
            <button>
              load
            </button>
          </div>"
        `);

        // Activate Comp2 fetcher, which now officially kicks out Comp1's
        // fetcher from useFetchers and reflects Comp2's fetcher
        fireEvent.click(screen.getByText("load"));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              ["loading"]
            </p>
            <p>
              2
              loading
              null
            </p>
            <button>
              load
            </button>
          </div>"
        `);

        // Comp2 loader resolves with the same data, useFetchers reflects idle-done
        await waitFor(() => screen.getByText(/2.*idle/));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              ["idle"]
            </p>
            <p>
              2
              idle
              data 2
            </p>
            <button>
              load
            </button>
          </div>"
        `);
      });

      it("handles revalidating fetchers", async () => {
        let count = 0;
        let fetchCount = 0;
        let router = createTestRouter(
          createRoutesFromElements(
            <>
              <Route
                path="/"
                element={<Comp />}
                action={async ({ request }) => {
                  let formData = await request.formData();
                  count =
                    count + parseInt(String(formData.get("increment")), 10);
                  return { count };
                }}
                loader={async () => ({ count: ++count })}
              />
              <Route
                path="/fetch"
                loader={async () => ({ fetchCount: ++fetchCount })}
              />
            </>
          ),
          {
            window: getWindow("/"),
            hydrationData: { loaderData: { "0": null } },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Comp() {
          let fetcher = useFetcher();
          return (
            <>
              <p id="output">
                {fetcher.state}
                {fetcher.data ? JSON.stringify(fetcher.data) : null}
              </p>
              <button onClick={() => fetcher.load("/fetch")}>
                load fetcher
              </button>
              <Form method="post">
                <button type="submit" name="increment" value="10">
                  submit
                </button>
              </Form>
            </>
          );
        }

        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            idle
          </p>"
        `);

        await act(async () => {
          fireEvent.click(screen.getByText("load fetcher"));
          await waitFor(() => screen.getByText(/idle/));
        });
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            idle
            {"fetchCount":1}
          </p>"
        `);

        await act(async () => {
          fireEvent.click(screen.getByText("submit"));
          await waitFor(() => screen.getByText(/idle/));
        });
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<p
            id="output"
          >
            idle
            {"fetchCount":2}
          </p>"
        `);
      });

      it("handles fetcher 404 errors at the correct spot in the route hierarchy", async () => {
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" element={<Outlet />} errorElement={<p>Not I!</p>}>
              <Route
                path="child"
                element={<Comp />}
                errorElement={<ErrorElement />}
              />
            </Route>
          ),
          {
            window: getWindow("/child"),
            hydrationData: { loaderData: { "0": null } },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Comp() {
          let fetcher = useFetcher();
          return (
            <button onClick={() => fetcher.load("/not-found")}>load</button>
          );
        }

        function ErrorElement() {
          let { status, statusText } = useRouteError() as ErrorResponse;
          return <p>contextual error:{`${status} ${statusText}`}</p>;
        }

        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <button>
              load
            </button>
          </div>"
        `);

        fireEvent.click(screen.getByText("load"));
        await waitFor(() => screen.getByText(/Not Found/));
        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <p>
              contextual error:
              404 Not Found
            </p>
          </div>"
        `);
      });

      it("handles fetcher.load errors at the correct spot in the route hierarchy", async () => {
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" element={<Outlet />} errorElement={<p>Not I!</p>}>
              <Route
                path="child"
                element={<Comp />}
                errorElement={<ErrorElement />}
              />
              <Route
                path="fetch"
                loader={() => {
                  throw new Error("Kaboom!");
                }}
                errorElement={<p>Not I!</p>}
              />
            </Route>
          ),
          {
            window: getWindow("/child"),
            hydrationData: { loaderData: { "0": null } },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Comp() {
          let fetcher = useFetcher();
          return <button onClick={() => fetcher.load("/fetch")}>load</button>;
        }

        function ErrorElement() {
          let error = useRouteError() as Error;
          return <p>contextual error:{error.message}</p>;
        }

        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <button>
              load
            </button>
          </div>"
        `);

        fireEvent.click(screen.getByText("load"));
        await waitFor(() => screen.getByText(/Kaboom!/));
        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <p>
              contextual error:
              Kaboom!
            </p>
          </div>"
        `);
      });

      it("handles fetcher.submit errors at the correct spot in the route hierarchy", async () => {
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" element={<Outlet />} errorElement={<p>Not I!</p>}>
              <Route
                path="child"
                element={<Comp />}
                errorElement={<ErrorElement />}
              />
              <Route
                path="fetch"
                action={() => {
                  throw new Error("Kaboom!");
                }}
                errorElement={<p>Not I!</p>}
              />
            </Route>
          ),
          {
            window: getWindow("/child"),
            hydrationData: { loaderData: { "0": null } },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Comp() {
          let fetcher = useFetcher();
          return (
            <button
              onClick={() =>
                fetcher.submit(
                  { key: "value" },
                  { method: "post", action: "/fetch" }
                )
              }
            >
              submit
            </button>
          );
        }

        function ErrorElement() {
          let error = useRouteError() as Error;
          return <p>contextual error:{error.message}</p>;
        }

        expect(getHtml(container)).toMatchInlineSnapshot(`
            "<div>
              <button>
                submit
              </button>
            </div>"
          `);

        fireEvent.click(screen.getByText("submit"));
        await waitFor(() => screen.getByText(/Kaboom!/));
        expect(getHtml(container)).toMatchInlineSnapshot(`
            "<div>
              <p>
                contextual error:
                Kaboom!
              </p>
            </div>"
          `);
      });

      it("handles fetcher.Form errors at the correct spot in the route hierarchy", async () => {
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" element={<Outlet />} errorElement={<p>Not I!</p>}>
              <Route
                path="child"
                element={<Comp />}
                errorElement={<ErrorElement />}
              />
              <Route
                path="fetch"
                action={() => {
                  throw new Error("Kaboom!");
                }}
                errorElement={<p>Not I!</p>}
              />
            </Route>
          ),
          {
            window: getWindow("/child"),
            hydrationData: { loaderData: { "0": null } },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Comp() {
          let fetcher = useFetcher();
          return (
            <fetcher.Form method="post" action="/fetch">
              <button type="submit" name="key" value="value">
                submit
              </button>
            </fetcher.Form>
          );
        }

        function ErrorElement() {
          let error = useRouteError() as Error;
          return <p>contextual error:{error.message}</p>;
        }

        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <form
              action="/fetch"
              method="post"
            >
              <button
                name="key"
                type="submit"
                value="value"
              >
                submit
              </button>
            </form>
          </div>"
        `);

        fireEvent.click(screen.getByText("submit"));
        await waitFor(() => screen.getByText(/Kaboom!/));
        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <p>
              contextual error:
              Kaboom!
            </p>
          </div>"
        `);
      });

      it("useFetcher is stable across across location changes", async () => {
        let router = createBrowserRouter(
          [
            {
              path: "/",
              Component() {
                const [, setSearchParams] = useSearchParams();
                let [count, setCount] = React.useState(0);
                let fetcherCount = React.useRef(0);
                let fetcher = useFetcher();
                React.useEffect(() => {
                  fetcherCount.current++;
                }, [fetcher.submit]);
                return (
                  <>
                    <button
                      onClick={() => {
                        setCount(count + 1);
                        setSearchParams({
                          random: Math.random().toString(),
                        });
                      }}
                    >
                      Click
                    </button>
                    <p>
                      {`render count:${count}`}
                      {`fetcher count:${fetcherCount.current}`}
                    </p>
                  </>
                );
              },
            },
          ],
          {
            window: getWindow("/"),
          }
        );

        let { container } = render(<RouterProvider router={router} />);

        let html = getHtml(container);
        expect(html).toContain("render count:0");
        expect(html).toContain("fetcher count:0");

        fireEvent.click(screen.getByText("Click"));
        fireEvent.click(screen.getByText("Click"));
        fireEvent.click(screen.getByText("Click"));
        await waitFor(() => screen.getByText(/render count:3/));

        html = getHtml(container);
        expect(html).toContain("render count:3");
        expect(html).toContain("fetcher count:1");
      });

      it("allows direct actions to be passed to fetcher.submit()", async () => {
        let router = createTestRouter(
          [
            {
              path: "/",
              Component() {
                let fetcher = useFetcher();
                return (
                  <>
                    <button
                      onClick={() =>
                        fetcher.submit(new FormData(), {
                          method: "post",
                          action: () => "ACTION",
                        })
                      }
                    >
                      Submit
                    </button>
                    <p>{fetcher.data || "empty"}</p>
                  </>
                );
              },
            },
          ],
          {
            window: getWindow("/"),
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        expect(getHtml(container)).toMatch("empty");

        fireEvent.click(screen.getByText("Submit"));
        await waitFor(() => screen.getByText("ACTION"));
        expect(getHtml(container)).toMatch("ACTION");
      });

      it("allows direct actions to override the fetch route action", async () => {
        let router = createTestRouter(
          [
            {
              path: "/",
              action: () => "ACTION ROUTE",
              Component() {
                let fetcher = useFetcher();
                return (
                  <>
                    <button
                      onClick={() =>
                        fetcher.submit(new FormData(), {
                          method: "post",
                        })
                      }
                    >
                      Submit Route
                    </button>
                    <button
                      onClick={() =>
                        fetcher.submit(new FormData(), {
                          method: "post",
                          action: () => "ACTION OVERRIDE",
                        })
                      }
                    >
                      Submit Override
                    </button>
                    <p>{fetcher.data || "empty"}</p>
                  </>
                );
              },
            },
          ],
          {
            window: getWindow("/"),
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        expect(getHtml(container)).toMatch("empty");
        fireEvent.click(screen.getByText("Submit Route"));
        await waitFor(() => screen.getByText("ACTION ROUTE"));
        expect(getHtml(container)).toMatch("ACTION ROUTE");

        fireEvent.click(screen.getByText("Submit Override"));
        await waitFor(() => screen.getByText("ACTION OVERRIDE"));
        expect(getHtml(container)).toMatch("ACTION OVERRIDE");
      });

      describe("with a basename", () => {
        it("prepends the basename to fetcher.load paths", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/" element={<Comp />}>
                <Route path="fetch" loader={() => "FETCH"} />
              </Route>
            ),
            {
              basename: "/base",
              window: getWindow("/base"),
            }
          );
          let { container } = render(<RouterProvider router={router} />);

          function Comp() {
            let fetcher = useFetcher();
            return (
              <>
                <p>{`data:${fetcher.data}`}</p>
                <button onClick={() => fetcher.load("/fetch")}>load</button>
              </>
            );
          }

          expect(getHtml(container)).toMatchInlineSnapshot(`
            "<div>
              <p>
                data:undefined
              </p>
              <button>
                load
              </button>
            </div>"
          `);

          fireEvent.click(screen.getByText("load"));
          await waitFor(() => screen.getByText(/FETCH/));
          expect(getHtml(container)).toMatchInlineSnapshot(`
            "<div>
              <p>
                data:FETCH
              </p>
              <button>
                load
              </button>
            </div>"
          `);
        });

        it('prepends the basename to fetcher.submit({ method: "get" }) paths', async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/" element={<Comp />}>
                <Route path="fetch" loader={() => "FETCH"} />
              </Route>
            ),
            {
              basename: "/base",
              window: getWindow("/base"),
            }
          );
          let { container } = render(<RouterProvider router={router} />);

          function Comp() {
            let fetcher = useFetcher();
            return (
              <>
                <p>{`data:${fetcher.data}`}</p>
                <button
                  onClick={() =>
                    fetcher.submit({}, { method: "get", action: "/fetch" })
                  }
                >
                  load
                </button>
              </>
            );
          }

          expect(getHtml(container)).toMatchInlineSnapshot(`
            "<div>
              <p>
                data:undefined
              </p>
              <button>
                load
              </button>
            </div>"
          `);

          fireEvent.click(screen.getByText("load"));
          await waitFor(() => screen.getByText(/FETCH/));
          expect(getHtml(container)).toMatchInlineSnapshot(`
            "<div>
              <p>
                data:FETCH
              </p>
              <button>
                load
              </button>
            </div>"
          `);
        });

        it('prepends the basename to fetcher.submit({ method: "post" }) paths', async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/" element={<Comp />}>
                <Route path="fetch" action={() => "FETCH"} />
              </Route>
            ),
            {
              basename: "/base",
              window: getWindow("/base"),
            }
          );
          let { container } = render(<RouterProvider router={router} />);

          function Comp() {
            let fetcher = useFetcher();
            return (
              <>
                <p>{`data:${fetcher.data}`}</p>
                <button
                  onClick={() =>
                    fetcher.submit({}, { method: "post", action: "/fetch" })
                  }
                >
                  submit
                </button>
              </>
            );
          }

          expect(getHtml(container)).toMatchInlineSnapshot(`
            "<div>
              <p>
                data:undefined
              </p>
              <button>
                submit
              </button>
            </div>"
          `);

          fireEvent.click(screen.getByText("submit"));
          await waitFor(() => screen.getByText(/FETCH/));
          expect(getHtml(container)).toMatchInlineSnapshot(`
            "<div>
              <p>
                data:FETCH
              </p>
              <button>
                submit
              </button>
            </div>"
          `);
        });
        it("prepends the basename to fetcher.Form paths", async () => {
          let router = createTestRouter(
            createRoutesFromElements(
              <Route path="/" element={<Comp />}>
                <Route path="fetch" action={() => "FETCH"} />
              </Route>
            ),
            {
              basename: "/base",
              window: getWindow("/base"),
            }
          );
          let { container } = render(<RouterProvider router={router} />);

          function Comp() {
            let fetcher = useFetcher();
            return (
              <>
                <p>{`data:${fetcher.data}`}</p>
                <fetcher.Form method="post" action="/fetch">
                  <button type="submit">submit</button>
                </fetcher.Form>
              </>
            );
          }

          expect(getHtml(container)).toMatchInlineSnapshot(`
            "<div>
              <p>
                data:undefined
              </p>
              <form
                action="/base/fetch"
                method="post"
              >
                <button
                  type="submit"
                >
                  submit
                </button>
              </form>
            </div>"
          `);

          fireEvent.click(screen.getByText("submit"));
          await waitFor(() => screen.getByText(/FETCH/));
          expect(getHtml(container)).toMatchInlineSnapshot(`
            "<div>
              <p>
                data:FETCH
              </p>
              <form
                action="/base/fetch"
                method="post"
              >
                <button
                  type="submit"
                >
                  submit
                </button>
              </form>
            </div>"
          `);
        });
      });
    });

    describe("errors", () => {
      it("renders hydration errors on leaf elements", async () => {
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" element={<Comp />}>
              <Route
                path="child"
                element={<Comp />}
                errorElement={<ErrorBoundary />}
              />
            </Route>
          ),
          {
            window: getWindow("/child"),
            hydrationData: {
              loaderData: {
                "0": "parent data",
              },
              actionData: {
                "0": "parent action",
              },
              errors: {
                "0-0": new Error("Kaboom 💥"),
              },
            },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Comp() {
          let data = useLoaderData();
          let actionData = useActionData();
          let navigation = useNavigation();
          return (
            <div>
              <>{data}</>
              <>{actionData}</>
              <>{navigation.state}</>
              <Outlet />
            </div>
          );
        }

        function ErrorBoundary() {
          let error = useRouteError() as Error;
          return <p>{error.message}</p>;
        }

        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <div>
              parent data
              parent action
              idle
              <p>
                Kaboom 💥
              </p>
            </div>
          </div>"
        `);
      });

      it("renders hydration errors on lazy leaf elements with preloading", async () => {
        let routes = createRoutesFromElements(
          <Route path="/" element={<Comp />}>
            <Route
              path="child"
              lazy={async () => ({
                element: <Comp />,
                errorElement: <ErrorBoundary />,
              })}
            />
          </Route>
        );

        let lazyMatches = matchRoutes(routes, { pathname: "/child" })?.filter(
          (m) => m.route.lazy
        );

        if (lazyMatches && lazyMatches?.length > 0) {
          await Promise.all(
            lazyMatches.map(async (m) => {
              let routeModule = await m.route.lazy!();
              Object.assign(m.route, { ...routeModule, lazy: undefined });
            })
          );
        }

        let router = createTestRouter(routes, {
          window: getWindow("/child"),
          hydrationData: {
            loaderData: {
              "0": "parent data",
            },
            actionData: {
              "0": "parent action",
            },
            errors: {
              "0-0": new Error("Kaboom 💥"),
            },
          },
        });

        let { container } = render(<RouterProvider router={router} />);

        function Comp() {
          let data = useLoaderData();
          let actionData = useActionData();
          let navigation = useNavigation();
          return (
            <div>
              <>{data}</>
              <>{actionData}</>
              <>{navigation.state}</>
              <Outlet />
            </div>
          );
        }

        function ErrorBoundary() {
          let error = useRouteError() as Error;
          return <p>{error.message}</p>;
        }

        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <div>
              parent data
              parent action
              idle
              <p>
                Kaboom 💥
              </p>
            </div>
          </div>"
        `);
      });

      it("renders hydration errors on parent elements", async () => {
        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" element={<Comp />} errorElement={<ErrorBoundary />}>
              <Route path="child" element={<Comp />} />
            </Route>
          ),
          {
            window: getWindow("/child"),
            hydrationData: {
              loaderData: {},
              actionData: null,
              errors: {
                "0": new Error("Kaboom 💥"),
              },
            },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Comp() {
          let data = useLoaderData();
          let actionData = useActionData();
          let navigation = useNavigation();
          return (
            <div>
              <>{data}</>
              <>{actionData}</>
              <>{navigation.state}</>
              <Outlet />
            </div>
          );
        }

        function ErrorBoundary() {
          let error = useRouteError() as Error;
          return <p>{error.message}</p>;
        }

        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <p>
              Kaboom 💥
            </p>
          </div>"
        `);
      });

      it("renders hydration errors on lazy parent elements with preloading", async () => {
        let routes = createRoutesFromElements(
          <Route
            path="/"
            lazy={async () => ({
              element: <Comp />,
              errorElement: <ErrorBoundary />,
            })}
          >
            <Route path="child" element={<Comp />} />
          </Route>
        );

        let lazyMatches = matchRoutes(routes, { pathname: "/child" })?.filter(
          (m) => m.route.lazy
        );

        if (lazyMatches && lazyMatches?.length > 0) {
          await Promise.all(
            lazyMatches.map(async (m) => {
              let routeModule = await m.route.lazy!();
              Object.assign(m.route, { ...routeModule, lazy: undefined });
            })
          );
        }

        let router = createTestRouter(routes, {
          window: getWindow("/child"),
          hydrationData: {
            loaderData: {},
            actionData: null,
            errors: {
              "0": new Error("Kaboom 💥"),
            },
          },
        });

        let { container } = render(<RouterProvider router={router} />);

        function Comp() {
          let data = useLoaderData();
          let actionData = useActionData();
          let navigation = useNavigation();
          return (
            <div>
              <>{data}</>
              <>{actionData}</>
              <>{navigation.state}</>
              <Outlet />
            </div>
          );
        }

        function ErrorBoundary() {
          let error = useRouteError() as Error;
          return <p>{error.message}</p>;
        }

        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <p>
              Kaboom 💥
            </p>
          </div>"
        `);
      });

      it("renders navigation errors on leaf elements", async () => {
        let fooDefer = createDeferred();
        let barDefer = createDeferred();

        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" element={<Layout />}>
              <Route
                path="foo"
                loader={() => fooDefer.promise}
                element={<Foo />}
                errorElement={<FooError />}
              />
              <Route
                path="bar"
                loader={() => barDefer.promise}
                element={<Bar />}
                errorElement={<BarError />}
              />
            </Route>
          ),
          {
            window: getWindow("/foo"),
            hydrationData: {
              loaderData: {
                "0-0": {
                  message: "hydrated from foo",
                },
              },
            },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Layout() {
          let navigation = useNavigation();
          return (
            <div>
              <Link to="/foo">Link to Foo</Link>
              <Link to="/bar">Link to Bar</Link>
              <div id="output">
                <p>{navigation.state}</p>
                <Outlet />
              </div>
            </div>
          );
        }

        function Foo() {
          let data = useLoaderData() as { message: string };
          return <h1>Foo:{data.message}</h1>;
        }
        function FooError() {
          let error = useRouteError() as Error;
          return <p>Foo Error:{error.message}</p>;
        }
        function Bar() {
          let data = useLoaderData() as { message: string };
          return <h1>Bar:{data.message}</h1>;
        }
        function BarError() {
          let error = useRouteError() as Error;
          return <p>Bar Error:{error.message}</p>;
        }

        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              idle
            </p>
            <h1>
              Foo:
              hydrated from foo
            </h1>
          </div>"
        `);

        fireEvent.click(screen.getByText("Link to Bar"));
        barDefer.reject(new Error("Kaboom!"));
        await waitFor(() => screen.getByText("idle"));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              idle
            </p>
            <p>
              Bar Error:
              Kaboom!
            </p>
          </div>"
        `);

        fireEvent.click(screen.getByText("Link to Foo"));
        fooDefer.reject(new Error("Kaboom!"));
        await waitFor(() => screen.getByText("idle"));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              idle
            </p>
            <p>
              Foo Error:
              Kaboom!
            </p>
          </div>"
        `);
      });

      it("renders navigation errors on parent elements", async () => {
        let fooDefer = createDeferred();
        let barDefer = createDeferred();

        let router = createTestRouter(
          createRoutesFromElements(
            <Route path="/" element={<Layout />} errorElement={<LayoutError />}>
              <Route
                path="foo"
                loader={() => fooDefer.promise}
                element={<Foo />}
                errorElement={<FooError />}
              />
              <Route
                path="bar"
                loader={() => barDefer.promise}
                element={<Bar />}
              />
            </Route>
          ),
          {
            window: getWindow("/foo"),
            hydrationData: {
              loaderData: {
                "0-0": {
                  message: "hydrated from foo",
                },
              },
            },
          }
        );
        let { container } = render(<RouterProvider router={router} />);

        function Layout() {
          let navigation = useNavigation();
          return (
            <div>
              <Link to="/foo">Link to Foo</Link>
              <Link to="/bar">Link to Bar</Link>
              <div id="output">
                <p>{navigation.state}</p>
                <Outlet />
              </div>
            </div>
          );
        }
        function LayoutError() {
          let error = useRouteError() as Error;
          return <p>Layout Error:{error.message}</p>;
        }
        function Foo() {
          let data = useLoaderData() as { message: string };
          return <h1>Foo:{data.message}</h1>;
        }
        function FooError() {
          let error = useRouteError() as Error;
          return <p>Foo Error:{error.message}</p>;
        }
        function Bar() {
          let data = useLoaderData() as { message: string };
          return <h1>Bar:{data.message}</h1>;
        }

        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              idle
            </p>
            <h1>
              Foo:
              hydrated from foo
            </h1>
          </div>"
        `);

        fireEvent.click(screen.getByText("Link to Bar"));
        barDefer.reject(new Error("Kaboom!"));
        await waitFor(() => screen.getByText("Layout Error:Kaboom!"));
        expect(getHtml(container)).toMatchInlineSnapshot(`
          "<div>
            <p>
              Layout Error:
              Kaboom!
            </p>
          </div>"
        `);
      });

      // This test ensures that when manual routes are used, we add hasErrorBoundary
      it("renders navigation errors on leaf elements (when using manual route objects)", async () => {
        let barDefer = createDeferred();

        let routes = [
          {
            path: "/",
            element: <Layout />,
            children: [
              {
                path: "foo",
                element: <h1>Foo</h1>,
              },
              {
                path: "bar",
                loader: () => barDefer.promise,
                element: <Bar />,
                errorElement: <BarError />,
              },
            ],
          },
        ];

        let router = createTestRouter(routes, { window: getWindow("/foo") });
        let { container } = render(<RouterProvider router={router} />);

        function Layout() {
          let navigation = useNavigation();
          return (
            <div>
              <Link to="/bar">Link to Bar</Link>
              <div id="output">
                <p>{navigation.state}</p>
                <Outlet />
              </div>
            </div>
          );
        }

        function Bar() {
          let data = useLoaderData() as { message: string };
          return <h1>Bar:{data.message}</h1>;
        }
        function BarError() {
          let error = useRouteError() as Error;
          return <p>Bar Error:{error.message}</p>;
        }

        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              idle
            </p>
            <h1>
              Foo
            </h1>
          </div>"
        `);

        fireEvent.click(screen.getByText("Link to Bar"));
        barDefer.reject(new Error("Kaboom!"));
        await waitFor(() => screen.getByText("idle"));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              idle
            </p>
            <p>
              Bar Error:
              Kaboom!
            </p>
          </div>"
        `);
      });

      // This test ensures that when manual routes are used, we add hasErrorBoundary
      it("renders navigation errors on lazy leaf elements (when using manual route objects)", async () => {
        let lazyDefer = createDeferred();
        let barDefer = createDeferred();

        let routes: RouteObject[] = [
          {
            path: "/",
            element: <Layout />,
            children: [
              {
                path: "foo",
                element: <h1>Foo</h1>,
              },
              {
                path: "bar",
                lazy: async () => lazyDefer.promise as Promise<RouteObject>,
              },
            ],
          },
        ];

        let router = createTestRouter(routes, { window: getWindow("/foo") });
        let { container } = render(<RouterProvider router={router} />);

        function Layout() {
          let navigation = useNavigation();
          return (
            <div>
              <Link to="/bar">Link to Bar</Link>
              <div id="output">
                <p>{navigation.state}</p>
                <Outlet />
              </div>
            </div>
          );
        }

        function Bar() {
          let data = useLoaderData() as { message: string };
          return <h1>Bar:{data.message}</h1>;
        }
        function BarError() {
          let error = useRouteError() as Error;
          return <p>Bar Error:{error.message}</p>;
        }

        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              idle
            </p>
            <h1>
              Foo
            </h1>
          </div>"
        `);

        fireEvent.click(screen.getByText("Link to Bar"));
        await lazyDefer.resolve({
          loader: () => barDefer.promise,
          element: <Bar />,
          errorElement: <BarError />,
        });
        barDefer.reject(new Error("Kaboom!"));
        await waitFor(() => screen.getByText("idle"));
        expect(getHtml(container.querySelector("#output")!))
          .toMatchInlineSnapshot(`
          "<div
            id="output"
          >
            <p>
              idle
            </p>
            <p>
              Bar Error:
              Kaboom!
            </p>
          </div>"
        `);
      });
    });
  });
}

function createDeferred() {
  let resolve: (val?: any) => Promise<void>;
  let reject: (error?: Error) => Promise<void>;
  let promise = new Promise((res, rej) => {
    resolve = async (val: any) => {
      res(val);
      try {
        await promise;
      } catch (e) {}
    };
    reject = async (error?: Error) => {
      rej(error);
      try {
        await promise;
      } catch (e) {}
    };
  });
  return {
    promise,
    //@ts-ignore
    resolve,
    //@ts-ignore
    reject,
  };
}

function getWindowImpl(initialUrl: string, isHash = false): Window {
  // Need to use our own custom DOM in order to get a working history
  const dom = new JSDOM(`<!DOCTYPE html>`, { url: "http://localhost/" });
  dom.window.history.replaceState(null, "", (isHash ? "#" : "") + initialUrl);
  return dom.window as unknown as Window;
}

function getHtml(container: HTMLElement) {
  return prettyDOM(container, undefined, {
    highlight: false,
    theme: {
      comment: null,
      content: null,
      prop: null,
      tag: null,
      value: null,
    },
  });
}
