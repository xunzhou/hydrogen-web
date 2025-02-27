/*
Copyright 2020 Bruno Windels <bruno@windels.cloud>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import {TemplateView} from "../general/TemplateView";
import {spinner} from "../common.js";

/** a view used both in the login view and the loading screen
to show the current state of loading the session.
Just a spinner and a label, meant to be used as a paragraph */
export class SessionLoadStatusView extends TemplateView {
    render(t) {
        return t.div({className: "SessionLoadStatusView"}, [
            spinner(t, {hiddenWithLayout: vm => !vm.loading}),
            t.p(vm => vm.loadLabel)
        ]);
    }
}
