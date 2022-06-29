/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {CommonModule, Location} from '@angular/common';
import {SpyLocation} from '@angular/common/testing';
import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Injectable, NgModule, TemplateRef, Type, ViewChild, ViewContainerRef} from '@angular/core';
import {ComponentFixture, fakeAsync, TestBed, tick} from '@angular/core/testing';
import {ChildrenOutletContexts, Resolve, Router} from '@angular/router';
import {RouterTestingModule} from '@angular/router/testing';
import {of} from 'rxjs';
import {delay, mapTo} from 'rxjs/operators';

describe('Integration', () => {
  describe('routerLinkActive', () => {
    it('should update when the associated routerLinks change - #18469', fakeAsync(() => {
         @Component({
           template: `
          <a id="first-link" [routerLink]="[firstLink]" routerLinkActive="active">{{firstLink}}</a>
          <div id="second-link" routerLinkActive="active">
            <a [routerLink]="[secondLink]">{{secondLink}}</a>
          </div>
           `,
         })
         class LinkComponent {
           firstLink = 'link-a';
           secondLink = 'link-b';

           changeLinks(): void {
             const temp = this.secondLink;
             this.secondLink = this.firstLink;
             this.firstLink = temp;
           }
         }

         @Component({template: 'simple'})
         class SimpleCmp {
         }

         TestBed.configureTestingModule({
           imports: [RouterTestingModule.withRoutes(
               [{path: 'link-a', component: SimpleCmp}, {path: 'link-b', component: SimpleCmp}])],
           declarations: [LinkComponent, SimpleCmp]
         });

         const router: Router = TestBed.inject(Router);
         const fixture = createRoot(router, LinkComponent);
         const firstLink = fixture.debugElement.query(p => p.nativeElement.id === 'first-link');
         const secondLink = fixture.debugElement.query(p => p.nativeElement.id === 'second-link');
         router.navigateByUrl('/link-a');
         advance(fixture);

         expect(firstLink.nativeElement.classList).toContain('active');
         expect(secondLink.nativeElement.classList).not.toContain('active');

         fixture.componentInstance.changeLinks();
         fixture.detectChanges();
         advance(fixture);

         expect(firstLink.nativeElement.classList).not.toContain('active');
         expect(secondLink.nativeElement.classList).toContain('active');
       }));

    it('should not cause infinite loops in the change detection - #15825', fakeAsync(() => {
         @Component({selector: 'simple', template: 'simple'})
         class SimpleCmp {
         }

         @Component({
           selector: 'some-root',
           template: `
        <div *ngIf="show">
          <ng-container *ngTemplateOutlet="tpl"></ng-container>
        </div>
        <router-outlet></router-outlet>
        <ng-template #tpl>
          <a routerLink="/simple" routerLinkActive="active"></a>
        </ng-template>`
         })
         class MyCmp {
           show: boolean = false;
         }

         @NgModule({
           imports: [CommonModule, RouterTestingModule],
           declarations: [MyCmp, SimpleCmp],
         })
         class MyModule {
         }

         TestBed.configureTestingModule({imports: [MyModule]});

         const router: Router = TestBed.inject(Router);
         const fixture = createRoot(router, MyCmp);
         router.resetConfig([{path: 'simple', component: SimpleCmp}]);

         router.navigateByUrl('/simple');
         advance(fixture);

         const instance = fixture.componentInstance;
         instance.show = true;
         expect(() => advance(fixture)).not.toThrow();
       }));

    it('should set isActive right after looking at its children -- #18983', fakeAsync(() => {
         @Component({
           template: `
          <div #rla="routerLinkActive" routerLinkActive>
            isActive: {{rla.isActive}}

            <ng-template let-data>
              <a [routerLink]="data">link</a>
            </ng-template>

            <ng-container #container></ng-container>
          </div>
        `
         })
         class ComponentWithRouterLink {
           // TODO(issue/24571): remove '!'.
           @ViewChild(TemplateRef, {static: true}) templateRef!: TemplateRef<any>;
           // TODO(issue/24571): remove '!'.
           @ViewChild('container', {read: ViewContainerRef, static: true})
           container!: ViewContainerRef;

           addLink() {
             this.container.createEmbeddedView(this.templateRef, {$implicit: '/simple'});
           }

           removeLink() {
             this.container.clear();
           }
         }

         @Component({template: 'simple'})
         class SimpleCmp {
         }

         TestBed.configureTestingModule({
           imports: [RouterTestingModule.withRoutes([{path: 'simple', component: SimpleCmp}])],
           declarations: [ComponentWithRouterLink, SimpleCmp]
         });

         const router: Router = TestBed.inject(Router);
         const fixture = createRoot(router, ComponentWithRouterLink);
         router.navigateByUrl('/simple');
         advance(fixture);

         fixture.componentInstance.addLink();
         fixture.detectChanges();

         fixture.componentInstance.removeLink();
         advance(fixture);
         advance(fixture);

         expect(fixture.nativeElement.innerHTML).toContain('isActive: false');
       }));

    it('should set isActive with OnPush change detection - #19934', fakeAsync(() => {
         @Component({
           template: `
             <div routerLink="/simple" #rla="routerLinkActive" routerLinkActive>
               isActive: {{rla.isActive}}
             </div>
           `,
           changeDetection: ChangeDetectionStrategy.OnPush
         })
         class OnPushComponent {
         }

         @Component({template: 'simple'})
         class SimpleCmp {
         }

         TestBed.configureTestingModule({
           imports: [RouterTestingModule.withRoutes([{path: 'simple', component: SimpleCmp}])],
           declarations: [OnPushComponent, SimpleCmp]
         });

         const router: Router = TestBed.get(Router);
         const fixture = createRoot(router, OnPushComponent);
         router.navigateByUrl('/simple');
         advance(fixture);

         expect(fixture.nativeElement.innerHTML).toContain('isActive: true');
       }));
  });

  it('should not reactivate a deactivated outlet when destroyed and recreated - #41379',
     fakeAsync(() => {
       @Component({template: 'simple'})
       class SimpleComponent {
       }

       @Component({template: ` <router-outlet *ngIf="outletVisible" name="aux"></router-outlet> `})
       class AppComponent {
         outletVisible = true;
       }

       TestBed.configureTestingModule({
         imports: [RouterTestingModule.withRoutes(
             [{path: ':id', component: SimpleComponent, outlet: 'aux'}])],
         declarations: [SimpleComponent, AppComponent],
       });

       const router = TestBed.inject(Router);
       const fixture = createRoot(router, AppComponent);
       const componentCdr = fixture.componentRef.injector.get<ChangeDetectorRef>(ChangeDetectorRef);

       router.navigate([{outlets: {aux: ['1234']}}]);
       advance(fixture);
       expect(fixture.nativeElement.innerHTML).toContain('simple');

       router.navigate([{outlets: {aux: null}}]);
       advance(fixture);
       expect(fixture.nativeElement.innerHTML).not.toContain('simple');

       fixture.componentInstance.outletVisible = false;
       componentCdr.detectChanges();
       expect(fixture.nativeElement.innerHTML).not.toContain('simple');
       expect(fixture.nativeElement.innerHTML).not.toContain('router-outlet');

       fixture.componentInstance.outletVisible = true;
       componentCdr.detectChanges();
       expect(fixture.nativeElement.innerHTML).toContain('router-outlet');
       expect(fixture.nativeElement.innerHTML).not.toContain('simple');
     }));

  describe('useHash', () => {
    it('should restore hash to match current route - #28561', fakeAsync(() => {
         @Component({selector: 'root-cmp', template: `<router-outlet></router-outlet>`})
         class RootCmp {
         }

         @Component({template: 'simple'})
         class SimpleCmp {
         }
         @Component({template: 'one'})
         class OneCmp {
         }

         TestBed.configureTestingModule({
           imports: [RouterTestingModule.withRoutes([
             {path: '', component: SimpleCmp},
             {path: 'one', component: OneCmp, canActivate: ['returnRootUrlTree']}
           ])],
           declarations: [SimpleCmp, RootCmp, OneCmp],
           providers: [
             {
               provide: 'returnRootUrlTree',
               useFactory: (router: Router) => () => {
                 return router.parseUrl('/');
               },
               deps: [Router]
             },
           ],
         });

         const router = TestBed.inject(Router);
         const location = TestBed.inject(Location) as SpyLocation;

         router.navigateByUrl('/');
         // Will setup location change listeners
         const fixture = createRoot(router, RootCmp);

         location.simulateHashChange('/one');
         advance(fixture);

         expect(location.path()).toEqual('/');
         expect(fixture.nativeElement.innerHTML).toContain('one');
       }));
  });

  describe('duplicate navigation handling (#43447, #43446)', () => {
    let location: SpyLocation;
    let router: Router;
    let fixture: ComponentFixture<{}>;

    beforeEach(fakeAsync(() => {
      @Injectable()
      class DelayedResolve implements Resolve<{}> {
        resolve() {
          return of('').pipe(delay(1000), mapTo(true));
        }
      }
      @Component({selector: 'root-cmp', template: `<router-outlet></router-outlet>`})
      class RootCmp {
      }

      @Component({template: 'simple'})
      class SimpleCmp {
      }
      @Component({template: 'one'})
      class OneCmp {
      }
      TestBed.configureTestingModule({
        imports: [RouterTestingModule.withRoutes(
            [
              {path: '', component: SimpleCmp},
              {path: 'one', component: OneCmp, resolve: {x: DelayedResolve}}
            ],
            {useHash: true})],
        declarations: [SimpleCmp, RootCmp, OneCmp],
        providers: [DelayedResolve],
      });

      router = TestBed.inject(Router);
      location = TestBed.inject(Location) as SpyLocation;

      router.navigateByUrl('/');
      // Will setup location change listeners
      fixture = createRoot(router, RootCmp);
    }));

    it('duplicate navigation to same url', fakeAsync(() => {
         location.simulateHashChange('/one');
         tick(100);
         location.simulateHashChange('/one');
         tick(1000);
         advance(fixture);

         expect(location.path()).toEqual('/one');
         expect(fixture.nativeElement.innerHTML).toContain('one');
       }));

    it('works with a duplicate popstate/hashchange navigation (as seen in firefox)',
       fakeAsync(() => {
         (location as any)._subject.emit({'url': 'one', 'pop': true, 'type': 'popstate'});
         tick(1);
         (location as any)._subject.emit({'url': 'one', 'pop': true, 'type': 'hashchange'});
         tick(1000);
         advance(fixture);

         expect(router.routerState.toString()).toContain(`url:'one'`);
         expect(fixture.nativeElement.innerHTML).toContain('one');
       }));
  });

  it('should not unregister outlet if a different one already exists #36711, 32453', async () => {
    @Component({
      template: `
      <router-outlet *ngIf="outlet1"></router-outlet>
      <router-outlet *ngIf="outlet2"></router-outlet>
      `,
    })
    class TestCmp {
      outlet1 = true;
      outlet2 = false;
    }

    @Component({template: ''})
    class EmptyCmp {
    }

    TestBed.configureTestingModule({
      imports: [CommonModule, RouterTestingModule.withRoutes([{path: '**', component: EmptyCmp}])],
      declarations: [TestCmp, EmptyCmp]
    });
    const fixture = TestBed.createComponent(TestCmp);
    const contexts = TestBed.inject(ChildrenOutletContexts);
    await TestBed.inject(Router).navigateByUrl('/');
    fixture.detectChanges();

    expect(contexts.getContext('primary')).toBeDefined();
    expect(contexts.getContext('primary')?.outlet).not.toBeNull();

    // Show the second outlet. Applications shouldn't really have more than one outlet but there can
    // be timing issues between destroying and recreating a second one in some cases:
    // https://github.com/angular/angular/issues/36711,
    // https://github.com/angular/angular/issues/32453
    fixture.componentInstance.outlet2 = true;
    fixture.detectChanges();
    expect(contexts.getContext('primary')?.outlet).not.toBeNull();

    fixture.componentInstance.outlet1 = false;
    fixture.detectChanges();
    // Destroying the first one show not clear the outlet context because the second one takes over
    // as the registered outlet.
    expect(contexts.getContext('primary')?.outlet).not.toBeNull();
  });
});

function advance<T>(fixture: ComponentFixture<T>): void {
  tick();
  fixture.detectChanges();
}

function createRoot<T>(router: Router, type: Type<T>): ComponentFixture<T> {
  const f = TestBed.createComponent(type);
  advance(f);
  router.initialNavigation();
  advance(f);
  return f;
}
