import { Reflector } from '@nestjs/core';
import { ROLES_KEY, Roles } from '../../../../src/common/decorators/roles.decorator';
import { UserRole } from '../../../../src/common/enums/user-role.enum';

describe('@Roles() decorator', () => {
  it('should set the correct metadata key', () => {
    expect(ROLES_KEY).toBe('roles');
  });

  it('should set a single role as metadata', () => {
    @Roles(UserRole.ADMIN)
    class TestClass {}

    const reflector = new Reflector();
    const roles = reflector.get<UserRole[]>(ROLES_KEY, TestClass);
    expect(roles).toEqual([UserRole.ADMIN]);
  });

  it('should set multiple roles as metadata', () => {
    @Roles(UserRole.BORROWER, UserRole.ADMIN)
    class TestClass {}

    const reflector = new Reflector();
    const roles = reflector.get<UserRole[]>(ROLES_KEY, TestClass);
    expect(roles).toEqual([UserRole.BORROWER, UserRole.ADMIN]);
  });

  it('should set all four roles as metadata', () => {
    @Roles(UserRole.ADMIN, UserRole.MERCHANT, UserRole.LP_PROVIDER, UserRole.BORROWER)
    class TestClass {}

    const reflector = new Reflector();
    const roles = reflector.get<UserRole[]>(ROLES_KEY, TestClass);
    expect(roles).toEqual([UserRole.ADMIN, UserRole.MERCHANT, UserRole.LP_PROVIDER, UserRole.BORROWER]);
  });

  it('should set empty array when called with no arguments', () => {
    @Roles()
    class TestClass {}

    const reflector = new Reflector();
    const roles = reflector.get<UserRole[]>(ROLES_KEY, TestClass);
    expect(roles).toEqual([]);
  });
});
